import { EVENTS } from "@ryvan/common";
import type { AuditService } from "@ryvan/audit";
import type { EventBus } from "@ryvan/events";
import type { MissionService } from "@ryvan/mission-engine";
import type { PolicyService } from "@ryvan/policy-engine";
import type { WorkflowDefinition, WorkflowService } from "@ryvan/workflow-engine";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrap } from "./bootstrap.js";
import type { PlatformConfig } from "./types.js";

/** A two-step workflow with an approval gate in the middle. */
const payrollWorkflow: WorkflowDefinition = {
  id: "payroll",
  name: "Run payroll",
  version: "1.0.0",
  steps: [
    { id: "collect", name: "Collect attendance", kind: "action", handler: "collect" },
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

const baseConfig: PlatformConfig = {
  identity: { tokenSecret: "test-secret-value-at-least-32-chars-long" },
  models: { defaultModel: "claude-haiku-4-5" },
  workflow: { definitions: [payrollWorkflow] },
  mission: { templates: [{ type: "payroll.run", workflowId: "payroll" }] },
};

let running: Awaited<ReturnType<typeof bootstrap>>[] = [];

async function startPlatform(overrides: Partial<PlatformConfig> = {}) {
  const platform = await bootstrap({ ...baseConfig, ...overrides });
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
    events: platform.container.resolve<EventBus>("events"),
  };
}

afterEach(async () => {
  for (const platform of running) await platform.stop();
  running = [];
});

describe("platform bootstrap", () => {
  it("starts every service and exposes them on the container", async () => {
    const { platform } = await startPlatform();

    expect(platform.status()).toBe("running");

    for (const name of [
      "events",
      "identity",
      "models",
      "memory",
      "tools",
      "policy",
      "audit",
      "connectors",
      "workflow",
      "mission",
      "agent-runtime",
      "agent-sdk",
    ]) {
      expect(platform.container.has(name)).toBe(true);
    }
  });

  it("stops cleanly", async () => {
    const { platform } = await startPlatform();

    await platform.stop();

    expect(platform.status()).toBe("stopped");
  });

  it("runs a mission end to end through policy, workflow, and audit", async () => {
    const { mission, policy, audit } = await startPlatform();

    // The workflow's approval step suspends the run, so the mission stays running.
    const launched = await mission.launch({
      type: "payroll.run",
      goal: "Run July payroll",
      subject: { userId: "u1", orgId: "acme", roles: ["org:owner"] },
    });

    expect(launched.status).toBe("running");

    const pending = await policy.approvals.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.reason).toBe("Payroll moves money");

    // Granting the approval releases the workflow, which finishes the mission.
    await policy.grantApproval(pending[0]!.id, "u-cfo");

    const workflow = running[0]!.container.resolve<WorkflowService>("workflow");
    await workflow.tick();

    const finished = await mission.get(launched.id);
    expect(finished?.status).toBe("completed");
    expect(finished?.result).toMatchObject({ pay: { paid: 42 } });

    // The whole thing left an intact audit trail.
    const entries = await audit.query();
    const actions = entries.map((entry) => entry.action);

    expect(actions).toContain(EVENTS.MISSION_CREATED);
    expect(actions).toContain(EVENTS.APPROVAL_REQUESTED);
    expect(actions).toContain(EVENTS.APPROVAL_GRANTED);
    expect(actions).toContain(EVENTS.WORKFLOW_COMPLETED);
    expect(actions).toContain(EVENTS.MISSION_COMPLETED);
    expect((await audit.verify()).valid).toBe(true);
  });

  it("blocks a mission the policy denies, and records the denial", async () => {
    const { mission, audit } = await startPlatform({
      policy: {
        rules: [
          {
            id: "no-payroll",
            name: "Payroll is frozen",
            effect: "deny",
            when: { resources: ["mission:payroll.run"] },
            reason: "Payroll is frozen for month-end close",
          },
        ],
      },
    });

    const launched = await mission.launch({
      type: "payroll.run",
      subject: { userId: "u1", orgId: "acme" },
    });

    expect(launched.status).toBe("failed");
    expect(launched.error).toContain("month-end close");
    expect(launched.runId).toBeUndefined();

    const actions = (await audit.query()).map((entry) => entry.action);
    expect(actions).toContain(EVENTS.POLICY_DENIED);
    expect(actions).not.toContain(EVENTS.WORKFLOW_STARTED);
  });

  it("denies a mission that would breach a budget", async () => {
    const { mission, policy } = await startPlatform({
      policy: {
        budgets: [{ id: "acme-total", scope: { orgId: "acme" }, period: "total", limitUsd: 10 }],
      },
    });

    policy.recordSpend({ orgId: "acme" }, 9.9);

    const launched = await mission.launch({
      type: "payroll.run",
      subject: { userId: "u1", orgId: "acme" },
      estimatedCostUsd: 5,
    });

    expect(launched.status).toBe("failed");
    expect(launched.error).toContain("acme-total");
  });

  it("records model spend against a global budget", async () => {
    const { policy, events } = await startPlatform({
      policy: {
        budgets: [{ id: "global", scope: {}, period: "total", limitUsd: 100 }],
      },
    });

    await events.emit(EVENTS.MODEL_RESPONSE, {
      model: "claude-haiku-4-5",
      usage: { estimatedCost: 0.25 },
    });

    expect(policy.budgets.status("global").spentUsd).toBeCloseTo(0.25);
  });

  it("can opt out of model spend tracking", async () => {
    const { policy, events } = await startPlatform({
      policy: {
        trackModelSpend: false,
        budgets: [{ id: "global", scope: {}, period: "total", limitUsd: 100 }],
      },
    });

    await events.emit(EVENTS.MODEL_RESPONSE, { usage: { estimatedCost: 0.25 } });

    expect(policy.budgets.status("global").spentUsd).toBe(0);
  });
});
