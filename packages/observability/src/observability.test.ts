import { EVENTS } from "@ryvan/common";
import { EventBus } from "@ryvan/events";
import { afterEach, describe, expect, it } from "vitest";
import { ObservabilityService } from "./observability-service.js";
import { InMemoryTraceStore } from "./store.js";
import { Tracer } from "./tracer.js";
import type { SpanNode } from "./types.js";

const TRACE = "corr_1";

let services: ObservabilityService[] = [];

afterEach(async () => {
  for (const service of services) await service.stop();
  services = [];
});

async function setup() {
  const eventBus = new EventBus();
  const service = new ObservabilityService({ eventBus });
  await service.start();
  services.push(service);
  return { eventBus, service };
}

/** Flattens a tree into "kind:name" paths so assertions read like a timeline. */
function paths(nodes: SpanNode[], prefix = ""): string[] {
  return nodes.flatMap((node) => {
    const here = `${prefix}${node.kind}:${node.name}`;
    return [here, ...paths(node.children, `${here} > `)];
  });
}

describe("Tracer", () => {
  it("opens and closes a span, recording duration", async () => {
    const tracer = new Tracer();
    const span = await tracer.startSpan({ name: "work", kind: "custom", traceId: TRACE });

    const closed = await tracer.endSpan(span!.id, { status: "ok" });

    expect(closed!.status).toBe("ok");
    expect(closed!.endedAt).toBeGreaterThanOrEqual(closed!.startedAt);
    expect(closed!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("will not close a span twice", async () => {
    const tracer = new Tracer();
    const span = await tracer.startSpan({ name: "work", kind: "custom", traceId: TRACE });

    await tracer.endSpan(span!.id);

    expect(await tracer.endSpan(span!.id)).toBeUndefined();
  });

  it("finds an open span by key and forgets it once closed", async () => {
    const tracer = new Tracer();
    await tracer.startSpan({ name: "work", kind: "custom", traceId: TRACE, key: "k" });

    expect(await tracer.openSpan("k")).toBeDefined();
    expect(await tracer.endByKey("k")).toBeDefined();
    expect(await tracer.endByKey("k")).toBeUndefined();
  });

  it("records a one-shot span backdated by its duration", async () => {
    const tracer = new Tracer();

    const span = await tracer.recordSpan({
      name: "send_email",
      kind: "tool",
      traceId: TRACE,
      durationMs: 250,
    });

    expect(span!.durationMs).toBe(250);
    expect(span!.endedAt! - span!.startedAt).toBe(250);
  });

  it("rolls up cost and tokens across the trace", async () => {
    const tracer = new Tracer();

    await tracer.recordSpan({
      name: "a",
      kind: "model",
      traceId: TRACE,
      costUsd: 0.25,
      tokens: 100,
    });
    await tracer.recordSpan({
      name: "b",
      kind: "model",
      traceId: TRACE,
      costUsd: 0.1,
      tokens: 40,
    });

    const trace = await tracer.trace(TRACE);

    expect(trace!.totalCostUsd).toBeCloseTo(0.35);
    expect(trace!.totalTokens).toBe(140);
    expect(trace!.spanCount).toBe(2);
  });

  it("reports a trace as running while any span is open", async () => {
    const tracer = new Tracer();
    const span = await tracer.startSpan({ name: "a", kind: "custom", traceId: TRACE });

    expect((await tracer.trace(TRACE))!.status).toBe("running");
    expect((await tracer.trace(TRACE))!.durationMs).toBeUndefined();

    await tracer.endSpan(span!.id);
    expect((await tracer.trace(TRACE))!.status).toBe("ok");
  });

  it("reports a trace as errored when any span failed", async () => {
    const tracer = new Tracer();
    await tracer.recordSpan({ name: "a", kind: "step", traceId: TRACE, status: "ok" });
    await tracer.recordSpan({ name: "b", kind: "step", traceId: TRACE, status: "error" });

    const trace = await tracer.trace(TRACE);

    expect(trace!.status).toBe("error");
    expect(trace!.errorCount).toBe(1);
  });

  it("returns undefined for an unknown trace", async () => {
    expect(await new Tracer().trace("nope")).toBeUndefined();
  });

  it("builds a tree from parent links", async () => {
    const tracer = new Tracer();
    const root = await tracer.startSpan({ name: "mission", kind: "mission", traceId: TRACE });
    const child = await tracer.startSpan({
      name: "workflow",
      kind: "workflow",
      traceId: TRACE,
      parentSpanId: root!.id,
    });
    await tracer.startSpan({
      name: "step",
      kind: "step",
      traceId: TRACE,
      parentSpanId: child!.id,
    });

    expect(paths(await tracer.tree(TRACE))).toEqual([
      "mission:mission",
      "mission:mission > workflow:workflow",
      "mission:mission > workflow:workflow > step:step",
    ]);
  });

  it("promotes an orphan to a root rather than dropping it", async () => {
    const tracer = new Tracer();
    await tracer.startSpan({
      name: "orphan",
      kind: "tool",
      traceId: TRACE,
      parentSpanId: "span_never_recorded",
    });

    expect(paths(await tracer.tree(TRACE))).toEqual(["tool:orphan"]);
  });

  it("drops spans past the per-trace cap instead of growing without bound", async () => {
    const tracer = new Tracer(new InMemoryTraceStore(), 3);

    for (let i = 0; i < 10; i++) {
      await tracer.startSpan({ name: `s${i}`, kind: "custom", traceId: TRACE });
    }

    expect((await tracer.spans(TRACE)).length).toBe(3);
  });

  it("requires a trace id and a name", async () => {
    const tracer = new Tracer();

    await expect(tracer.startSpan({ name: "a", kind: "custom", traceId: "" })).rejects.toThrow();
    await expect(tracer.startSpan({ name: "", kind: "custom", traceId: TRACE })).rejects.toThrow();
  });
});

describe("ObservabilityService", () => {
  it("assembles a mission > workflow > step tree from events alone", async () => {
    const { eventBus, service } = await setup();
    const opts = { correlationId: TRACE };

    await eventBus.emit(
      EVENTS.MISSION_CREATED,
      { missionId: "m1", type: "payroll.run", subject: { orgId: "acme" } },
      opts,
    );
    await eventBus.emit(
      EVENTS.WORKFLOW_STARTED,
      { runId: "r1", definitionId: "payroll", missionId: "m1" },
      opts,
    );
    await eventBus.emit(
      EVENTS.WORKFLOW_STEP_STARTED,
      { runId: "r1", stepId: "collect", stepName: "Collect", kind: "action" },
      opts,
    );
    await eventBus.emit(EVENTS.WORKFLOW_STEP_COMPLETED, { runId: "r1", stepId: "collect" }, opts);
    await eventBus.emit(EVENTS.WORKFLOW_COMPLETED, { runId: "r1", missionId: "m1" }, opts);
    await eventBus.emit(EVENTS.MISSION_COMPLETED, { missionId: "m1" }, opts);

    expect(paths(await service.tree(TRACE))).toEqual([
      "mission:payroll.run",
      "mission:payroll.run > workflow:payroll",
      "mission:payroll.run > workflow:payroll > step:Collect",
    ]);

    const trace = await service.trace(TRACE);
    expect(trace!.status).toBe("ok");
    expect(trace!.missionId).toBe("m1");
    expect(trace!.orgId).toBe("acme");
  });

  it("attributes model cost to the trace that incurred it", async () => {
    const { eventBus, service } = await setup();
    const opts = { correlationId: TRACE };

    await eventBus.emit(EVENTS.MISSION_CREATED, { missionId: "m1", type: "ask" }, opts);
    await eventBus.emit(EVENTS.MODEL_CALLED, { requestId: "req1", model: "haiku" }, opts);
    await eventBus.emit(
      EVENTS.MODEL_RESPONSE,
      { requestId: "req1", usage: { estimatedCost: 0.42, totalTokens: 1200 } },
      opts,
    );
    await eventBus.emit(EVENTS.MISSION_COMPLETED, { missionId: "m1" }, opts);

    const trace = await service.trace(TRACE);

    expect(trace!.totalCostUsd).toBeCloseTo(0.42);
    expect(trace!.totalTokens).toBe(1200);

    // The model call nests under the mission, not beside it.
    expect(paths(await service.tree(TRACE))).toEqual(["mission:ask", "mission:ask > model:haiku"]);
  });

  it("nests a tool call under the step that was open when it ran", async () => {
    const { eventBus, service } = await setup();
    const opts = { correlationId: TRACE };

    await eventBus.emit(EVENTS.WORKFLOW_STARTED, { runId: "r1", definitionId: "wf" }, opts);
    await eventBus.emit(
      EVENTS.WORKFLOW_STEP_STARTED,
      { runId: "r1", stepId: "s1", stepName: "Notify" },
      opts,
    );
    await eventBus.emit(
      EVENTS.TOOL_EXECUTED,
      { toolName: "send_email", success: true, executionTimeMs: 30 },
      opts,
    );
    await eventBus.emit(EVENTS.WORKFLOW_STEP_COMPLETED, { runId: "r1", stepId: "s1" }, opts);
    await eventBus.emit(EVENTS.WORKFLOW_COMPLETED, { runId: "r1" }, opts);

    expect(paths(await service.tree(TRACE))).toEqual([
      "workflow:wf",
      "workflow:wf > step:Notify",
      "workflow:wf > step:Notify > tool:send_email",
    ]);
  });

  it("marks a failed step and its trace as errored", async () => {
    const { eventBus, service } = await setup();
    const opts = { correlationId: TRACE };

    await eventBus.emit(EVENTS.WORKFLOW_STARTED, { runId: "r1", definitionId: "wf" }, opts);
    await eventBus.emit(
      EVENTS.WORKFLOW_STEP_STARTED,
      { runId: "r1", stepId: "s1", stepName: "Charge" },
      opts,
    );
    await eventBus.emit(
      EVENTS.WORKFLOW_STEP_FAILED,
      { runId: "r1", stepId: "s1", error: "card declined", attempts: 3 },
      opts,
    );
    await eventBus.emit(EVENTS.WORKFLOW_FAILED, { runId: "r1", error: "step failed" }, opts);

    const spans = await service.spans(TRACE);
    const step = spans.find((span) => span.name === "Charge")!;

    expect(step.status).toBe("error");
    expect(step.error).toBe("card declined");
    expect(step.attributes.attempts).toBe(3);
    expect((await service.trace(TRACE))!.status).toBe("error");
  });

  it("records an approval step and notes the suspension on the run", async () => {
    const { eventBus, service } = await setup();
    const opts = { correlationId: TRACE };

    await eventBus.emit(EVENTS.WORKFLOW_STARTED, { runId: "r1", definitionId: "wf" }, opts);
    await eventBus.emit(
      EVENTS.WORKFLOW_STEP_STARTED,
      { runId: "r1", stepId: "ok", stepName: "Sign-off", kind: "approval" },
      opts,
    );
    await eventBus.emit(EVENTS.WORKFLOW_SUSPENDED, { runId: "r1" }, opts);

    const spans = await service.spans(TRACE);

    expect(spans.find((s) => s.name === "Sign-off")!.kind).toBe("approval");
    expect(spans.find((s) => s.name === "wf")!.events.map((e) => e.name)).toEqual(["suspended"]);
  });

  it("keeps separate missions in separate traces", async () => {
    const { eventBus, service } = await setup();

    await eventBus.emit(
      EVENTS.MISSION_CREATED,
      { missionId: "m1", type: "a" },
      { correlationId: "corr_a" },
    );
    await eventBus.emit(
      EVENTS.MISSION_CREATED,
      { missionId: "m2", type: "b" },
      { correlationId: "corr_b" },
    );

    expect(await service.spans("corr_a")).toHaveLength(1);
    expect(await service.spans("corr_b")).toHaveLength(1);
    expect((await service.traces()).map((t) => t.missionId).sort()).toEqual(["m1", "m2"]);
  });

  it("skips an event carrying no correlation rather than guessing a trace", async () => {
    const { eventBus, service } = await setup();

    // No correlationId anywhere — this call cannot be placed in a trace.
    await eventBus.emit(EVENTS.MODEL_CALLED, { requestId: "req1", model: "haiku" });

    expect(await service.traces()).toHaveLength(0);
  });

  it("falls back to a correlationId carried in the payload", async () => {
    const { eventBus, service } = await setup();

    await eventBus.emit(EVENTS.TOOL_EXECUTED, {
      toolName: "t",
      executionTimeMs: 5,
      correlationId: TRACE,
    });

    expect(await service.spans(TRACE)).toHaveLength(1);
  });

  it("filters traces by mission and org", async () => {
    const { eventBus, service } = await setup();

    await eventBus.emit(
      EVENTS.MISSION_CREATED,
      { missionId: "m1", type: "a", subject: { orgId: "acme" } },
      { correlationId: "corr_a" },
    );
    await eventBus.emit(
      EVENTS.MISSION_CREATED,
      { missionId: "m2", type: "b", subject: { orgId: "globex" } },
      { correlationId: "corr_b" },
    );

    expect((await service.traces({ missionId: "m1" })).map((t) => t.traceId)).toEqual(["corr_a"]);
    expect((await service.traces({ orgId: "globex" })).map((t) => t.traceId)).toEqual(["corr_b"]);
  });

  it("stops recording once stopped", async () => {
    const { eventBus, service } = await setup();

    await service.stop();
    await eventBus.emit(
      EVENTS.MISSION_CREATED,
      { missionId: "m1", type: "a" },
      {
        correlationId: TRACE,
      },
    );

    expect(await service.spans(TRACE)).toHaveLength(0);
  });

  it("reports its lifecycle", async () => {
    const service = new ObservabilityService({ eventBus: new EventBus() });
    services.push(service);

    expect(service.status()).toBe("stopped");
    await service.start();
    expect(service.status()).toBe("running");
    await service.stop();
    expect(service.status()).toBe("stopped");
  });
});
