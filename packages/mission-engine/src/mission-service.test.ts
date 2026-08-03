import { EVENTS } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { describe, expect, it } from "vitest";
import { MissionService } from "./mission-service.js";
import { TemplateMissionPlanner } from "./planner.js";
import type { PolicyGate, PolicyVerdict, WorkflowRunHandle, WorkflowRunner } from "./types.js";

/** Workflow runner whose outcome the test dictates. */
class FakeWorkflows implements WorkflowRunner {
  outcome: WorkflowRunHandle["status"] = "completed";
  outputs: Record<string, unknown> = { ok: true };
  error?: string;
  started: { workflowId: string; missionId?: string; input?: unknown }[] = [];
  cancelled: string[] = [];
  private readonly runs = new Map<string, WorkflowRunHandle>();
  private counter = 0;

  async start(workflowId: string, options: Parameters<WorkflowRunner["start"]>[1]) {
    this.started.push({ workflowId, missionId: options.missionId, input: options.input });

    const handle: WorkflowRunHandle = {
      id: `run-${++this.counter}`,
      status: this.outcome,
      outputs: this.outputs,
      error: this.error,
    };
    this.runs.set(handle.id, handle);
    return handle;
  }

  async get(runId: string) {
    return this.runs.get(runId);
  }

  async cancel(runId: string) {
    this.cancelled.push(runId);
    const handle = this.runs.get(runId) ?? { id: runId, status: "cancelled" as const };
    handle.status = "cancelled";
    this.runs.set(runId, handle);
    return handle;
  }

  /** Simulates a suspended run finishing later. */
  resolve(runId: string, status: WorkflowRunHandle["status"], error?: string): void {
    const handle = this.runs.get(runId);
    if (handle) {
      handle.status = status;
      handle.error = error;
    }
  }
}

class FakeGate implements PolicyGate {
  verdict: PolicyVerdict = { effect: "allow", allowed: true, reason: "ok" };
  approval: "pending" | "granted" | "denied" | "expired" = "pending";
  requests: unknown[] = [];

  async enforce(request: Parameters<PolicyGate["enforce"]>[0]) {
    this.requests.push(request);
    return this.verdict;
  }

  async checkApproval() {
    return this.approval;
  }
}

function setup(overrides: Partial<ConstructorParameters<typeof MissionService>[0]> = {}) {
  const eventBus = new EventBus();
  const workflows = new FakeWorkflows();
  const policy = new FakeGate();
  const planner = new TemplateMissionPlanner([
    { type: "payroll.run", workflowId: "payroll", defaults: { period: "monthly" } },
  ]);

  const service = new MissionService({
    eventBus,
    workflows,
    policy,
    planner,
    ...overrides,
  });

  return { service, eventBus, workflows, policy, planner };
}

const subject = { userId: "u1", orgId: "acme", roles: ["org:member"] };

function types(eventBus: EventBus): string[] {
  return eventBus.history(undefined, 1000).map((event) => event.type);
}

describe("MissionService", () => {
  it("runs a mission end to end", async () => {
    const { service, eventBus, workflows } = setup();

    const mission = await service.launch({
      type: "payroll.run",
      goal: "Run July payroll",
      input: { month: 7 },
      subject,
    });

    expect(mission.status).toBe("completed");
    expect(mission.workflowId).toBe("payroll");
    expect(mission.runId).toBe("run-1");
    expect(mission.result).toEqual({ ok: true });

    // The planner's defaults merge under the caller's input.
    expect(workflows.started[0]?.input).toEqual({ period: "monthly", month: 7 });
    expect(workflows.started[0]?.missionId).toBe(mission.id);

    expect(types(eventBus)).toEqual([
      EVENTS.MISSION_CREATED,
      EVENTS.MISSION_PLANNED,
      EVENTS.MISSION_STARTED,
      EVENTS.MISSION_COMPLETED,
    ]);
  });

  it("never starts a workflow when policy denies", async () => {
    const { service, eventBus, workflows, policy } = setup();
    policy.verdict = { effect: "deny", allowed: false, reason: "budget exceeded" };

    const mission = await service.launch({ type: "payroll.run", subject });

    expect(mission.status).toBe("failed");
    expect(mission.error).toContain("budget exceeded");
    expect(workflows.started).toHaveLength(0);
    expect(types(eventBus)).toContain(EVENTS.MISSION_FAILED);
    expect(types(eventBus)).not.toContain(EVENTS.MISSION_STARTED);
  });

  it("holds a mission at awaiting_approval and runs it once granted", async () => {
    const { service, eventBus, workflows, policy } = setup();
    policy.verdict = {
      effect: "require_approval",
      allowed: false,
      reason: "high value",
      approvalId: "appr-1",
    };

    const blocked = await service.launch({ type: "payroll.run", subject });

    expect(blocked.status).toBe("awaiting_approval");
    expect(blocked.approvalId).toBe("appr-1");
    expect(workflows.started).toHaveLength(0);
    expect(types(eventBus)).toContain(EVENTS.MISSION_AWAITING_APPROVAL);

    // Still pending — nothing moves.
    expect(await service.tick()).toHaveLength(0);

    policy.approval = "granted";
    const [advanced] = await service.tick();

    expect(advanced?.status).toBe("completed");
    expect(workflows.started).toHaveLength(1);
  });

  it("fails a mission whose approval is denied", async () => {
    const { service, policy } = setup();
    policy.verdict = {
      effect: "require_approval",
      allowed: false,
      reason: "high value",
      approvalId: "appr-1",
    };

    await service.launch({ type: "payroll.run", subject });
    policy.approval = "denied";

    expect((await service.tick())[0]?.status).toBe("failed");
  });

  it("forwards the projected cost to the policy gate", async () => {
    const { service, policy } = setup();

    await service.launch({ type: "payroll.run", subject, estimatedCostUsd: 12.5 });

    expect(policy.requests[0]).toMatchObject({
      action: "mission:execute",
      resource: "mission:payroll.run",
      estimatedCostUsd: 12.5,
    });
  });

  it("fails when the workflow fails", async () => {
    const { service, workflows } = setup();
    workflows.outcome = "failed";
    workflows.error = "step 3 blew up";

    const mission = await service.launch({ type: "payroll.run", subject });

    expect(mission.status).toBe("failed");
    expect(mission.error).toContain("step 3 blew up");
  });

  it("treats a compensated workflow as a failed mission", async () => {
    const { service, workflows } = setup();
    workflows.outcome = "compensated";
    workflows.error = "rolled back";

    expect((await service.launch({ type: "payroll.run", subject })).status).toBe("failed");
  });

  it("fails a mission with no template for its type", async () => {
    const { service, workflows } = setup();

    const mission = await service.launch({ type: "unknown.type", subject });

    expect(mission.status).toBe("failed");
    expect(mission.error).toContain("planning failed");
    expect(workflows.started).toHaveLength(0);
  });

  it("leaves a suspended workflow running and finishes on the workflow event", async () => {
    const { service, eventBus, workflows } = setup();
    workflows.outcome = "suspended";
    await service.start();

    const mission = await service.launch({ type: "payroll.run", subject });
    expect(mission.status).toBe("running");

    workflows.resolve(mission.runId!, "completed");
    await eventBus.emit(EVENTS.WORKFLOW_COMPLETED, {
      runId: mission.runId,
      missionId: mission.id,
    });

    expect((await service.get(mission.id))?.status).toBe("completed");
    await service.stop();
  });

  it("ignores a workflow event for an already finished mission", async () => {
    const { service, eventBus } = setup();
    await service.start();

    const mission = await service.launch({ type: "payroll.run", subject });
    expect(mission.status).toBe("completed");

    await eventBus.emit(EVENTS.WORKFLOW_FAILED, {
      runId: mission.runId,
      missionId: mission.id,
      error: "late failure",
    });

    expect((await service.get(mission.id))?.status).toBe("completed");
    await service.stop();
  });

  it("cancels the underlying workflow run", async () => {
    const { service, workflows } = setup();
    workflows.outcome = "suspended";

    const mission = await service.launch({ type: "payroll.run", subject });
    const cancelled = await service.cancel(mission.id);

    expect(cancelled.status).toBe("cancelled");
    expect(workflows.cancelled).toEqual([mission.runId]);
  });

  it("leaves a completed mission alone when cancelled", async () => {
    const { service, workflows } = setup();

    const mission = await service.launch({ type: "payroll.run", subject });

    expect((await service.cancel(mission.id)).status).toBe("completed");
    expect(workflows.cancelled).toHaveLength(0);
  });

  it("runs without a policy gate configured", async () => {
    const { service } = setup({ policy: undefined });

    expect((await service.launch({ type: "payroll.run", subject })).status).toBe("completed");
  });

  it("fails when no workflow runner is configured", async () => {
    const { service } = setup({ workflows: undefined });

    const mission = await service.launch({ type: "payroll.run", subject });

    expect(mission.status).toBe("failed");
    expect(mission.error).toContain("workflow runner");
  });

  it("requires a mission type", async () => {
    const { service } = setup();

    await expect(service.launch({ type: "" })).rejects.toThrow();
  });

  it("throws when cancelling an unknown mission", async () => {
    const { service } = setup();

    await expect(service.cancel("missing")).rejects.toThrow();
  });
});
