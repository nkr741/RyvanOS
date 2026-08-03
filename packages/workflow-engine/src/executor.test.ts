import { EVENTS } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { describe, expect, it, vi } from "vitest";
import { WorkflowExecutor } from "./executor.js";
import { WorkflowRegistry } from "./registry.js";
import type {
  ApprovalGate,
  ApprovalGateStatus,
  StepHandler,
  WorkflowDefinition,
  WorkflowStepDefinition,
} from "./types.js";

const action = (
  id: string,
  handler: string,
  extra: Partial<WorkflowStepDefinition> = {},
): WorkflowStepDefinition => ({ id, name: id, kind: "action", handler, ...extra });

function definition(
  steps: WorkflowStepDefinition[],
  extra: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
  return { id: "wf", name: "Test", version: "1.0.0", steps, ...extra };
}

function setup(
  def: WorkflowDefinition,
  handlers: Record<string, StepHandler> = {},
  options: ConstructorParameters<typeof WorkflowExecutor>[1] = {},
) {
  const registry = new WorkflowRegistry();
  for (const [name, handler] of Object.entries(handlers)) {
    registry.registerHandler(name, handler);
  }
  registry.register(def);

  const eventBus = new EventBus();
  const executor = new WorkflowExecutor(registry, { ...options, eventBus });

  return { registry, executor, eventBus };
}

/** A gate whose verdict the test controls. */
class FakeGate implements ApprovalGate {
  status: ApprovalGateStatus = "pending";
  lastRequest?: Parameters<ApprovalGate["request"]>[0];
  private counter = 0;

  async request(input: Parameters<ApprovalGate["request"]>[0]) {
    this.lastRequest = input;
    return { approvalId: `appr-${++this.counter}`, status: this.status };
  }

  async check(): Promise<ApprovalGateStatus> {
    return this.status;
  }
}

describe("WorkflowExecutor", () => {
  it("runs a linear graph in dependency order", async () => {
    const order: string[] = [];
    const record =
      (id: string): StepHandler =>
      () => {
        order.push(id);
        return id;
      };

    const { executor } = setup(
      definition([
        action("first", "first"),
        action("second", "second", { dependsOn: ["first"] }),
        action("third", "third", { dependsOn: ["second"] }),
      ]),
      { first: record("first"), second: record("second"), third: record("third") },
    );

    const run = await executor.start("wf");

    expect(run.status).toBe("completed");
    expect(order).toEqual(["first", "second", "third"]);
    expect(run.outputs).toEqual({ first: "first", second: "second", third: "third" });
  });

  it("runs independent steps concurrently", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow: StepHandler = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
      return true;
    };

    const { executor } = setup(
      definition([action("a", "slow"), action("b", "slow"), action("c", "slow")]),
      { slow },
    );

    await executor.start("wf");

    expect(peak).toBeGreaterThan(1);
  });

  it("honours maxStepConcurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow: StepHandler = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
    };

    const { executor } = setup(
      definition([action("a", "slow"), action("b", "slow"), action("c", "slow")]),
      { slow },
      { maxStepConcurrency: 1 },
    );

    await executor.start("wf");

    expect(peak).toBe(1);
  });

  it("passes run input and prior outputs to handlers", async () => {
    const seen: Record<string, unknown> = {};

    const { executor } = setup(
      definition([
        action("a", "a"),
        action("b", "b", { dependsOn: ["a"], input: { multiplier: 3 } }),
      ]),
      {
        a: (ctx) => (ctx.input.value as number) * 2,
        b: (ctx) => {
          seen.outputs = ctx.outputs;
          seen.stepInput = ctx.stepInput;
          return (ctx.outputs.a as number) * (ctx.stepInput.multiplier as number);
        },
      },
    );

    const run = await executor.start("wf", { input: { value: 5 } });

    expect(seen.outputs).toEqual({ a: 10 });
    expect(seen.stepInput).toEqual({ multiplier: 3 });
    expect(run.outputs.b).toBe(30);
  });

  it("retries a failing step then succeeds", async () => {
    let attempts = 0;
    const flaky: StepHandler = () => {
      attempts++;
      if (attempts < 3) throw new Error("transient");
      return "ok";
    };

    const { executor } = setup(
      definition([action("a", "flaky", { retry: { maxAttempts: 3, baseDelayMs: 1 } })]),
      { flaky },
    );

    const run = await executor.start("wf");

    expect(run.status).toBe("completed");
    expect(attempts).toBe(3);
    expect(run.steps.a?.attempts).toBe(3);
  });

  it("fails the run when retries are exhausted", async () => {
    const { executor, eventBus } = setup(
      definition([
        action("a", "boom", { retry: { maxAttempts: 2, baseDelayMs: 1 } }),
        action("b", "noop", { dependsOn: ["a"] }),
      ]),
      {
        boom: () => {
          throw new Error("permanent");
        },
        noop: () => "never",
      },
    );

    const run = await executor.start("wf");

    expect(run.status).toBe("failed");
    expect(run.error).toContain("permanent");
    expect(run.steps.a?.attempts).toBe(2);
    expect(run.steps.b?.status).toBe("pending");
    expect(eventBus.history(EVENTS.WORKFLOW_FAILED)).toHaveLength(1);
  });

  it("continues past a tolerated failure but skips its dependents", async () => {
    const { executor } = setup(
      definition([
        action("a", "boom", { continueOnError: true }),
        action("b", "noop", { dependsOn: ["a"] }),
        action("c", "noop"),
      ]),
      {
        boom: () => {
          throw new Error("ignored");
        },
        noop: () => "ok",
      },
    );

    const run = await executor.start("wf");

    expect(run.status).toBe("completed");
    expect(run.steps.a?.status).toBe("failed");
    expect(run.steps.b?.status).toBe("skipped");
    expect(run.steps.c?.status).toBe("completed");
  });

  it("times a step out", async () => {
    const { executor } = setup(definition([action("a", "hang", { timeoutMs: 20 })]), {
      hang: () => new Promise(() => {}),
    });

    const run = await executor.start("wf");

    expect(run.status).toBe("failed");
    expect(run.steps.a?.error).toContain("timed out");
  });

  it("skips dependents when a conditional is false", async () => {
    const { executor } = setup(
      definition([
        { id: "gate", name: "gate", kind: "conditional", condition: () => false },
        action("a", "noop", { dependsOn: ["gate"] }),
        action("b", "noop", { dependsOn: ["a"] }),
        action("c", "noop"),
      ]),
      { noop: () => "ok" },
    );

    const run = await executor.start("wf");

    expect(run.status).toBe("completed");
    expect(run.steps.a?.status).toBe("skipped");
    expect(run.steps.b?.status).toBe("skipped");
    expect(run.steps.c?.status).toBe("completed");
  });

  it("runs dependents when a conditional is true", async () => {
    const { executor } = setup(
      definition([
        {
          id: "gate",
          name: "gate",
          kind: "conditional",
          condition: (ctx) => ctx.input.proceed === true,
        },
        action("a", "noop", { dependsOn: ["gate"] }),
      ]),
      { noop: () => "ok" },
    );

    const run = await executor.start("wf", { input: { proceed: true } });

    expect(run.steps.a?.status).toBe("completed");
  });

  it("suspends on an approval and completes once granted", async () => {
    const gate = new FakeGate();
    const { executor, eventBus } = setup(
      definition([
        { id: "ok", name: "ok", kind: "approval", approval: { reason: "spends money" } },
        action("after", "noop", { dependsOn: ["ok"] }),
      ]),
      { noop: () => "done" },
      { approvalGate: gate },
    );

    const suspended = await executor.start("wf");

    expect(suspended.status).toBe("suspended");
    expect(suspended.steps.ok?.status).toBe("waiting");
    expect(suspended.steps.ok?.approvalId).toBe("appr-1");
    expect(gate.lastRequest?.reason).toBe("spends money");
    expect(eventBus.history(EVENTS.WORKFLOW_SUSPENDED)).toHaveLength(1);

    gate.status = "granted";
    const resumed = await executor.resume(suspended.id);

    expect(resumed.status).toBe("completed");
    expect(resumed.outputs.after).toBe("done");
  });

  it("fails the run when an approval is denied", async () => {
    const gate = new FakeGate();
    const { executor } = setup(
      definition([{ id: "ok", name: "ok", kind: "approval", approval: { reason: "risky" } }]),
      {},
      { approvalGate: gate },
    );

    const suspended = await executor.start("wf");
    gate.status = "denied";
    const resumed = await executor.resume(suspended.id);

    expect(resumed.status).toBe("failed");
    expect(resumed.steps.ok?.error).toContain("denied");
  });

  it("completes an approval immediately when the gate grants up front", async () => {
    const gate = new FakeGate();
    gate.status = "granted";

    const { executor } = setup(
      definition([{ id: "ok", name: "ok", kind: "approval", approval: { reason: "cheap" } }]),
      {},
      { approvalGate: gate },
    );

    expect((await executor.start("wf")).status).toBe("completed");
  });

  it("refuses an approval step with no gate configured", async () => {
    const { executor } = setup(
      definition([{ id: "ok", name: "ok", kind: "approval", approval: { reason: "x" } }]),
    );

    const run = await executor.start("wf");

    expect(run.status).toBe("failed");
    expect(run.steps.ok?.error).toContain("approval gate");
  });

  it("suspends on a schedule delay and resumes when due", async () => {
    const { executor } = setup(
      definition([
        { id: "wait", name: "wait", kind: "schedule", schedule: { delayMs: 30 } },
        action("after", "noop", { dependsOn: ["wait"] }),
      ]),
      { noop: () => "done" },
    );

    const run = await executor.start("wf");
    expect(run.status).toBe("suspended");
    expect(await executor.dueRuns()).toHaveLength(0);

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(await executor.dueRuns()).toHaveLength(1);
    expect((await executor.resume(run.id)).status).toBe("completed");
  });

  it("waits for an event and completes when notified", async () => {
    const { executor } = setup(
      definition([
        {
          id: "wait",
          name: "wait",
          kind: "event",
          event: { type: "connector:executed" },
        },
        action("after", "noop", { dependsOn: ["wait"] }),
      ]),
      { noop: (ctx) => ctx.outputs.wait },
    );

    const run = await executor.start("wf");
    expect(run.status).toBe("suspended");

    const resumed = await executor.notifyEvent(run.id, "connector:executed", { id: 7 });

    expect(resumed?.status).toBe("completed");
    expect(resumed?.outputs.after).toEqual({ id: 7 });
  });

  it("ignores an event no step is waiting for", async () => {
    const { executor } = setup(
      definition([{ id: "wait", name: "wait", kind: "event", event: { type: "wanted" } }]),
    );

    const run = await executor.start("wf");

    expect(await executor.notifyEvent(run.id, "unwanted")).toBeUndefined();
  });

  it("fails an event step that times out", async () => {
    const { executor } = setup(
      definition([
        { id: "wait", name: "wait", kind: "event", event: { type: "never", timeoutMs: 20 } },
      ]),
    );

    const run = await executor.start("wf");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const resumed = await executor.resume(run.id);

    expect(resumed.status).toBe("failed");
    expect(resumed.steps.wait?.error).toContain("timed out");
  });

  it("compensates completed steps in reverse order when a later step fails", async () => {
    const undone: string[] = [];

    const { executor, eventBus } = setup(
      definition([
        action("a", "noop", { compensate: "undo" }),
        action("b", "noop", { dependsOn: ["a"], compensate: "undo" }),
        action("c", "boom", { dependsOn: ["b"] }),
      ]),
      {
        noop: () => "ok",
        boom: () => {
          throw new Error("late failure");
        },
        undo: (ctx) => {
          undone.push(ctx.stepId);
        },
      },
    );

    const run = await executor.start("wf");

    expect(run.status).toBe("compensated");
    expect(undone).toEqual(["b", "a"]);
    expect(run.steps.a?.status).toBe("compensated");
    expect(eventBus.history(EVENTS.WORKFLOW_COMPENSATED)).toHaveLength(1);
  });

  it("fails without compensating when no step declares a compensator", async () => {
    const { executor } = setup(
      definition([action("a", "noop"), action("b", "boom", { dependsOn: ["a"] })]),
      {
        noop: () => "ok",
        boom: () => {
          throw new Error("nope");
        },
      },
    );

    expect((await executor.start("wf")).status).toBe("failed");
  });

  it("cancels a suspended run", async () => {
    const { executor } = setup(
      definition([
        { id: "wait", name: "wait", kind: "schedule", schedule: { delayMs: 10_000 } },
        action("after", "noop", { dependsOn: ["wait"] }),
      ]),
      { noop: () => "done" },
    );

    const run = await executor.start("wf");
    const cancelled = await executor.cancel(run.id);

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.steps.wait?.status).toBe("skipped");
    expect(cancelled.steps.after?.status).toBe("skipped");
  });

  it("leaves a finished run alone when cancelled", async () => {
    const { executor } = setup(definition([action("a", "noop")]), { noop: () => "ok" });

    const run = await executor.start("wf");

    expect((await executor.cancel(run.id)).status).toBe("completed");
  });

  it("refuses to start when a referenced handler is not registered", async () => {
    const registry = new WorkflowRegistry();
    registry.register(definition([action("a", "missing")]));
    const executor = new WorkflowExecutor(registry);

    await expect(executor.start("wf")).rejects.toThrow(/unregistered handlers: missing/);
  });

  it("emits per-step lifecycle events", async () => {
    const { executor, eventBus } = setup(definition([action("a", "noop")]), {
      noop: () => "ok",
    });

    await executor.start("wf");

    expect(eventBus.history(EVENTS.WORKFLOW_STARTED)).toHaveLength(1);
    expect(eventBus.history(EVENTS.WORKFLOW_STEP_STARTED)).toHaveLength(1);
    expect(eventBus.history(EVENTS.WORKFLOW_STEP_COMPLETED)).toHaveLength(1);
    expect(eventBus.history(EVENTS.WORKFLOW_COMPLETED)).toHaveLength(1);
  });

  it("isolates persisted state from caller mutation", async () => {
    const { executor } = setup(definition([action("a", "noop")]), { noop: () => "ok" });

    const run = await executor.start("wf");
    run.outputs.a = "tampered";

    expect((await executor.get(run.id))?.outputs.a).toBe("ok");
  });

  it("aborts in-flight handlers when a run is cancelled", async () => {
    const observed = vi.fn();

    const { executor } = setup(definition([action("a", "slow")]), {
      slow: async (ctx) => {
        ctx.signal?.addEventListener("abort", () => observed());
        await new Promise((resolve) => setTimeout(resolve, 30));
      },
    });

    const running = executor.start("wf");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const runId = (await executor.list())[0]!.id;
    await executor.cancel(runId);
    const settled = await running;

    expect(observed).toHaveBeenCalled();
    // The cancellation must survive: drive() must not save its stale copy over it.
    expect(settled.status).toBe("cancelled");
    expect((await executor.get(runId))?.status).toBe("cancelled");
  });
});
