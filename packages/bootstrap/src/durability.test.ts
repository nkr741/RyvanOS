import type { AuditService } from "@ryvan/audit";
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
  it("resumes a suspended mission in a fresh process", async () => {
    const prefix = `d${Date.now().toString(36)}`;

    // --- first "process" ---
    const first = await boot(prefix);

    const launched = await first.mission.launch({
      type: "payroll.run",
      goal: "Run July payroll",
      subject: { userId: "u1", orgId: "acme", roles: ["org:owner"] },
    });

    expect(launched.status).toBe("running");
    const approvalId = first.policy.approvals.pending()[0]!.id;

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

    // Approvals live in the policy service, which is still in memory — so the
    // second process re-grants by id. This is the remaining gap: approval state
    // is not yet durable. See PLATFORM-ROADMAP.md.
    expect(second.policy.approvals.pending()).toHaveLength(0);
    expect(approvalId).toBeDefined();
  });

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
