import type { AuditService } from "@ryvan/audit";
import type { IdentityService } from "@ryvan/identity";
import type { MissionService } from "@ryvan/mission-engine";
import type { PolicyService } from "@ryvan/policy-engine";
import type { WorkflowDefinition, WorkflowService } from "@ryvan/workflow-engine";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap } from "./bootstrap.js";
import type { PlatformConfig } from "./types.js";

/**
 * Proves the platform survives a restart.
 *
 * Skips without a Postgres URL, so a laptop with no Docker still gets a green
 * run. CI must set it — "state is durable" is a claim that means nothing until
 * something actually stops the process and starts it again.
 */
const POSTGRES_URL = process.env.RYVAN_TEST_POSTGRES_URL;

const payroll: WorkflowDefinition = {
  id: "payroll",
  name: "Run payroll",
  version: "1.0.0",
  steps: [
    { id: "collect", name: "Collect", kind: "action", handler: "collect" },
    {
      id: "sign-off",
      name: "Finance sign-off",
      kind: "approval",
      dependsOn: ["collect"],
      approval: { reason: "Payroll moves money" },
    },
    { id: "pay", name: "Disburse", kind: "action", handler: "pay", dependsOn: ["sign-off"] },
  ],
};

let running: Awaited<ReturnType<typeof bootstrap>>[] = [];

afterEach(async () => {
  for (const platform of running) await platform.stop();
  running = [];
});

/** Boots a platform against a shared table prefix, as a restart would. */
async function boot(prefix: string) {
  const config: PlatformConfig = {
    identity: { tokenSecret: "test-secret-value-at-least-32-chars-long" },
    models: { defaultModel: "claude-haiku-4-5" },
    workflow: { definitions: [payroll] },
    mission: { templates: [{ type: "payroll.run", workflowId: "payroll" }] },
    storage: { postgresUrl: POSTGRES_URL, tablePrefix: prefix, vectorDimensions: 8 },
  };

  const platform = await bootstrap(config);
  running.push(platform);

  const workflow = platform.container.resolve<WorkflowService>("workflow");
  workflow.registerHandler("collect", () => ({ employees: 42 }));
  workflow.registerHandler("pay", (ctx) => ({
    paid: (ctx.outputs.collect as { employees: number }).employees,
  }));

  return {
    platform,
    workflow,
    mission: platform.container.resolve<MissionService>("mission"),
    policy: platform.container.resolve<PolicyService>("policy"),
    audit: platform.container.resolve<AuditService>("audit"),
  };
}

describe.skipIf(!POSTGRES_URL)("durability across a restart", () => {
  it("resumes a suspended mission, and finishes it, in a fresh process", async () => {
    const prefix = `d${Date.now().toString(36)}`;

    // --- first "process" ---
    const first = await boot(prefix);

    const launched = await first.mission.launch({
      type: "payroll.run",
      goal: "Run July payroll",
      subject: { userId: "u1", orgId: "acme", roles: ["org:owner"] },
    });

    expect(launched.status).toBe("running");
    const approvalId = (await first.policy.approvals.pending())[0]!.id;

    await first.platform.stop();

    // --- restart ---
    const second = await boot(prefix);

    // The mission and its suspended run came back from Postgres.
    const recovered = await second.mission.get(launched.id);
    expect(recovered).toBeDefined();
    expect(recovered!.status).toBe("running");

    const run = await second.workflow.get(recovered!.runId!);
    expect(run!.status).toBe("suspended");
    expect(run!.steps["collect"]!.status).toBe("completed");
    expect(run!.outputs.collect).toEqual({ employees: 42 });

    // The approval survived too, and is still the same request. Before it was
    // durable this came back empty and the workflow resumed straight to
    // "expired" — a deploy silently turned "waiting for the CFO" into a denial.
    const pending = await second.policy.approvals.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(approvalId);
    expect(pending[0]!.reason).toBe("Payroll moves money");

    // Granting in the second process releases the run the first process started.
    await second.policy.grantApproval(approvalId, "u-cfo");
    await second.workflow.tick();

    const finished = await second.mission.get(launched.id);
    expect(finished!.status).toBe("completed");
    expect(finished!.result).toMatchObject({ pay: { paid: 42 } });
  }, 30_000);

  it("recovers users, roles, and API keys in a fresh process", async () => {
    const prefix = `d${Date.now().toString(36)}i`;

    const first = await boot(prefix);
    const identity = first.platform.container.resolve<IdentityService>("identity");

    const org = await identity.createOrganization({ name: "Acme", slug: "acme" });
    const user = await identity.createUser({
      email: "person@example.com",
      name: "Person",
      password: "Str0ng!Passw0rd",
      organizationId: org.id,
    });
    const { rawKey } = await identity.apiKeys.generate(user.id, org.id, "CI", ["project:read"]);

    await first.platform.stop();

    const second = await boot(prefix);
    const recovered = second.platform.container.resolve<IdentityService>("identity");

    // The account still exists and the password still works.
    const auth = await recovered.authenticateWithPassword("person@example.com", "Str0ng!Passw0rd");
    expect(auth.user.id).toBe(user.id);

    // Roles were rehydrated, so the user is still authorised — not merely
    // authenticated and permitted nothing.
    expect(recovered.authorize(user.id, "project:read", { orgId: org.id })).toBe(true);

    // The API key issued before the restart is still valid.
    expect((await recovered.authenticateWithAPIKey(rawKey)).user.id).toBe(user.id);
  }, 30_000);

  it("keeps the audit chain intact and verifiable across a restart", async () => {
    const prefix = `d${Date.now().toString(36)}a`;

    const first = await boot(prefix);
    await first.mission.launch({
      type: "payroll.run",
      subject: { userId: "u1", orgId: "acme" },
    });
    const countBefore = (await first.audit.query()).length;
    expect(countBefore).toBeGreaterThan(0);
    await first.platform.stop();

    const second = await boot(prefix);

    const entries = await second.audit.query();
    expect(entries.length).toBe(countBefore);
    expect(entries.map((e) => e.sequence)).toEqual(
      Array.from({ length: entries.length }, (_, i) => i + 1),
    );

    // New entries chain onto the recovered tail rather than restarting at 1.
    await second.audit.record({ action: "manual:check" });
    const verification = await second.audit.verify();

    expect(verification.valid).toBe(true);
    expect(verification.entryCount).toBe(countBefore + 1);
  });

  it("registers the storage ports on the container", async () => {
    const { platform } = await boot(`d${Date.now().toString(36)}c`);

    expect(platform.container.has("documents")).toBe(true);
    expect(platform.container.has("cache")).toBe(true);
    expect(platform.container.has("vectors")).toBe(true);
  });
});

describe("in-memory fallback", () => {
  it("still boots with no storage configured", async () => {
    const platform = await bootstrap({
      identity: { tokenSecret: "test-secret-value-at-least-32-chars-long" },
      models: { defaultModel: "claude-haiku-4-5" },
    });
    running.push(platform);

    expect(platform.status()).toBe("running");
    expect(platform.container.has("documents")).toBe(true);
    expect(platform.container.has("cache")).toBe(true);
  });
});
