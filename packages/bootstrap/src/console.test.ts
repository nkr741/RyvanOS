import type { ConsoleService } from "@ryvan/console";
import type { MissionService } from "@ryvan/mission-engine";
import type { PolicyService } from "@ryvan/policy-engine";
import type { WorkflowDefinition, WorkflowService } from "@ryvan/workflow-engine";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap } from "./bootstrap.js";

const TOKEN = "console-token-at-least-16-chars";

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
  ],
};

let running: Awaited<ReturnType<typeof bootstrap>>[] = [];

afterEach(async () => {
  for (const platform of running) await platform.stop();
  running = [];
});

async function boot() {
  const platform = await bootstrap({
    identity: { tokenSecret: "test-secret-value-at-least-32-chars-long" },
    models: { defaultModel: "claude-haiku-4-5" },
    workflow: { definitions: [payroll] },
    mission: { templates: [{ type: "payroll.run", workflowId: "payroll" }] },
    // Port 0 lets the OS pick, so concurrent test files cannot collide.
    console: { token: TOKEN, port: 0 },
  });
  running.push(platform);

  const workflow = platform.container.resolve<WorkflowService>("workflow");
  workflow.registerHandler("collect", () => ({ employees: 42 }));

  const consoleService = platform.container.resolve<ConsoleService>("console");
  const base = consoleService.address()!;

  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(base + path, {
      ...init,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };

  return {
    platform,
    call,
    base,
    mission: platform.container.resolve<MissionService>("mission"),
    policy: platform.container.resolve<PolicyService>("policy"),
  };
}

describe("Developer Console over HTTP", () => {
  it("serves the UI and refuses unauthenticated requests", async () => {
    const { base } = await boot();

    const unauthorised = await fetch(`${base}/api/overview`);
    expect(unauthorised.status).toBe(401);

    const ui = await fetch(base, { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(ui.status).toBe(200);
    expect(await ui.text()).toContain("RyvanOS");
  });

  it("shows a real mission, its trace, and its cost", async () => {
    const { call, mission } = await boot();

    const launched = await mission.launch({
      type: "payroll.run",
      goal: "Run July payroll",
      subject: { userId: "u1", orgId: "acme" },
    });

    const list = await call("/api/missions");
    expect(list.status).toBe(200);
    expect(list.body.missions.map((m: { id: string }) => m.id)).toContain(launched.id);

    const detail = await call(`/api/missions/${launched.id}`);
    expect(detail.body.mission.goal).toBe("Run July payroll");

    // The trace is assembled from events the services already emit, so the
    // console shows the step tree without anything being instrumented for it.
    expect(detail.body.spans.length).toBeGreaterThan(0);
    expect(detail.body.trace.spanCount).toBeGreaterThan(0);
  });

  it("lists a pending approval and grants it, releasing the workflow", async () => {
    const { call, mission, platform } = await boot();

    const launched = await mission.launch({
      type: "payroll.run",
      subject: { userId: "u1", orgId: "acme" },
    });
    expect(launched.status).toBe("running");

    const pending = await call("/api/approvals");
    expect(pending.body.approvals).toHaveLength(1);
    expect(pending.body.approvals[0].reason).toBe("Payroll moves money");

    const granted = await call(`/api/approvals/${pending.body.approvals[0].id}/grant`, {
      method: "POST",
      body: JSON.stringify({ decidedBy: "u-cfo" }),
    });
    expect(granted.body.approval.status).toBe("granted");

    await platform.container.resolve<WorkflowService>("workflow").tick();
    expect((await mission.get(launched.id))?.status).toBe("completed");
  });

  it("refuses to decide an approval without a decider", async () => {
    const { call, mission } = await boot();
    await mission.launch({ type: "payroll.run", subject: { userId: "u1" } });

    const pending = await call("/api/approvals");
    const response = await call(`/api/approvals/${pending.body.approvals[0].id}/grant`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(await call("/api/approvals").then((r) => r.body.approvals)).toHaveLength(1);
  });

  it("summarises the platform in one overview request", async () => {
    const { call, mission } = await boot();
    await mission.launch({ type: "payroll.run", subject: { userId: "u1", orgId: "acme" } });

    const { body } = await call("/api/overview");

    expect(body.missions.total).toBeGreaterThan(0);
    expect(body.approvalsPending).toBe(1);
    expect(body.audit.valid).toBe(true);
    expect(body.services.length).toBeGreaterThan(10);
    expect(body.services.every((s: { status: string }) => s.status === "running")).toBe(true);
  });

  it("exposes the audit ledger and its verification", async () => {
    const { call, mission } = await boot();
    await mission.launch({ type: "payroll.run", subject: { userId: "u1" } });

    const entries = await call("/api/audit");
    expect(entries.body.entries.length).toBeGreaterThan(0);

    const verify = await call("/api/audit/verify");
    expect(verify.body.valid).toBe(true);
  });

  it("lists workflow runs with their step progress", async () => {
    const { call, mission } = await boot();
    await mission.launch({ type: "payroll.run", subject: { userId: "u1" } });

    const { body } = await call("/api/runs");

    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].steps.collect.status).toBe("completed");
    expect(body.runs[0].status).toBe("suspended");
  });

  it("reports health, circuits and policies", async () => {
    const { call } = await boot();

    expect((await call("/api/health")).body.services.length).toBeGreaterThan(10);
    expect((await call("/api/circuits")).body.circuits).toEqual([]);
    expect((await call("/api/policies")).body).toMatchObject({ rules: [], budgets: [] });
    expect((await call("/api/connectors")).body.connectors).toEqual([]);
  });

  it("does not start a console when no token is configured", async () => {
    const platform = await bootstrap({
      identity: { tokenSecret: "test-secret-value-at-least-32-chars-long" },
      models: { defaultModel: "claude-haiku-4-5" },
    });
    running.push(platform);

    // Opt-in: it exposes the audit trail and approval buttons, so it should
    // never appear because someone forgot to switch it off.
    expect(platform.container.has("console")).toBe(false);
    expect(platform.status()).toBe("running");
  });

  it("refuses to boot with a weak console token", async () => {
    await expect(
      bootstrap({
        identity: { tokenSecret: "test-secret-value-at-least-32-chars-long" },
        models: { defaultModel: "claude-haiku-4-5" },
        console: { token: "short", port: 0 },
      }),
    ).rejects.toThrow(/token/);
  });
});
