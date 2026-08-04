import { EVENTS } from "@ryvan/common";
import type { ILogger, Service, Status } from "@ryvan/common";
import type { EventSubscription, IEventBus, RyvanEvent } from "@ryvan/events";
import { Tracer } from "./tracer.js";
import type {
  ObservabilityServiceOptions,
  Span,
  SpanNode,
  Trace,
  TraceFilter,
} from "./types.js";

type Data = Record<string, unknown>;

const str = (data: Data, key: string): string | undefined => {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
};

const num = (data: Data, key: string): number | undefined => {
  const value = data[key];
  return typeof value === "number" ? value : undefined;
};

/**
 * Assembles traces from the platform's own events.
 *
 * No service was modified to produce spans. Mission, workflow, step, model,
 * tool and connector events already carry the identifiers needed to stitch a
 * tree together, so tracing is a *subscriber* — which means it cannot break the
 * thing it observes, and any service that starts emitting lifecycle events is
 * traced for free.
 *
 * The trace id is the event's `correlationId`. Missions generate one and pass
 * it to their workflow, so everything under one mission shares a trace.
 */
export class ObservabilityService implements Service {
  readonly name = "observability";

  readonly tracer: Tracer;

  private state: Status = "stopped";
  private readonly logger?: ILogger;
  private readonly eventBus?: IEventBus;
  private readonly subscriptions: EventSubscription[] = [];
  /** Open span ids per trace, innermost last — used to parent model/tool spans. */
  private readonly openStacks = new Map<string, string[]>();

  constructor(options: ObservabilityServiceOptions = {}) {
    this.tracer = new Tracer(options.store, options.maxSpansPerTrace);
    this.logger = options.logger;
    this.eventBus = options.eventBus;
  }

  async start(): Promise<void> {
    this.state = "starting";

    if (this.eventBus) {
      this.subscribe(EVENTS.MISSION_CREATED, (data, event) => this.onMissionStart(data, event));
      this.subscribe(EVENTS.MISSION_COMPLETED, (data, e) => this.onMissionEnd(data, e, "ok"));
      this.subscribe(EVENTS.MISSION_FAILED, (data, e) => this.onMissionEnd(data, e, "error"));
      this.subscribe(EVENTS.MISSION_CANCELLED, (data, e) => this.onMissionEnd(data, e, "cancelled"));
      this.subscribe(EVENTS.MISSION_AWAITING_APPROVAL, (data, e) =>
        this.note(e, `mission:${str(data, "missionId")}`, "awaiting_approval", data),
      );

      this.subscribe(EVENTS.WORKFLOW_STARTED, (data, event) => this.onWorkflowStart(data, event));
      this.subscribe(EVENTS.WORKFLOW_COMPLETED, (data, e) => this.onWorkflowEnd(data, e, "ok"));
      this.subscribe(EVENTS.WORKFLOW_FAILED, (data, e) => this.onWorkflowEnd(data, e, "error"));
      this.subscribe(EVENTS.WORKFLOW_CANCELLED, (data, e) =>
        this.onWorkflowEnd(data, e, "cancelled"),
      );
      this.subscribe(EVENTS.WORKFLOW_SUSPENDED, (data, e) =>
        this.note(e, `run:${str(data, "runId")}`, "suspended", data),
      );
      this.subscribe(EVENTS.WORKFLOW_RESUMED, (data, e) =>
        this.note(e, `run:${str(data, "runId")}`, "resumed", data),
      );

      this.subscribe(EVENTS.WORKFLOW_STEP_STARTED, (data, event) => this.onStepStart(data, event));
      this.subscribe(EVENTS.WORKFLOW_STEP_COMPLETED, (data, e) => this.onStepEnd(data, e, "ok"));
      this.subscribe(EVENTS.WORKFLOW_STEP_FAILED, (data, e) => this.onStepEnd(data, e, "error"));
      this.subscribe(EVENTS.WORKFLOW_STEP_SKIPPED, (data, e) =>
        this.onStepEnd(data, e, "cancelled"),
      );

      this.subscribe(EVENTS.MODEL_CALLED, (data, event) => this.onModelStart(data, event));
      this.subscribe(EVENTS.MODEL_RESPONSE, (data, event) => this.onModelEnd(data, event));

      this.subscribe(EVENTS.TOOL_EXECUTED, (data, e) => this.onPointSpan(data, e, "tool", true));
      this.subscribe(EVENTS.TOOL_ERROR, (data, e) => this.onPointSpan(data, e, "tool", false));
      this.subscribe(EVENTS.CONNECTOR_EXECUTED, (data, e) =>
        this.onPointSpan(data, e, "connector", true),
      );
      this.subscribe(EVENTS.CONNECTOR_ERROR, (data, e) =>
        this.onPointSpan(data, e, "connector", false),
      );
    }

    this.state = "running";
    this.logger?.info("Observability service started");
  }

  async stop(): Promise<void> {
    this.state = "stopping";

    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions.length = 0;
    this.openStacks.clear();

    this.state = "stopped";
    this.logger?.info("Observability service stopped");
  }

  status(): Status {
    return this.state;
  }

  async trace(traceId: string): Promise<Trace | undefined> {
    return this.tracer.trace(traceId);
  }

  async tree(traceId: string): Promise<SpanNode[]> {
    return this.tracer.tree(traceId);
  }

  async spans(traceId: string): Promise<Span[]> {
    return this.tracer.spans(traceId);
  }

  /** Distinct traces matching a filter, newest first. */
  async traces(filter?: TraceFilter): Promise<Trace[]> {
    const found = await this.tracer.findSpans(filter);
    const ids = Array.from(new Set(found.map((span) => span.traceId)));

    const traces: Trace[] = [];
    for (const traceId of ids) {
      const trace = await this.tracer.trace(traceId);
      if (trace) traces.push(trace);
    }

    return traces.sort((a, b) => b.startedAt - a.startedAt);
  }

  // --- handlers -------------------------------------------------------------

  private async onMissionStart(data: Data, event: RyvanEvent): Promise<void> {
    const traceId = this.traceIdOf(event, data);
    const missionId = str(data, "missionId");
    if (!traceId || !missionId) return;

    const subject = (data.subject ?? {}) as Data;

    await this.open(traceId, `mission:${missionId}`, {
      name: str(data, "type") ?? "mission",
      kind: "mission",
      traceId,
      attributes: {
        missionId,
        goal: data.goal,
        type: data.type,
        orgId: subject.orgId,
        userId: subject.userId,
      },
    });
  }

  private async onMissionEnd(data: Data, event: RyvanEvent, status: Span["status"]): Promise<void> {
    const traceId = this.traceIdOf(event, data);
    if (!traceId) return;

    await this.close(traceId, `mission:${str(data, "missionId")}`, {
      status,
      error: str(data, "error"),
    });
  }

  private async onWorkflowStart(data: Data, event: RyvanEvent): Promise<void> {
    const traceId = this.traceIdOf(event, data);
    const runId = str(data, "runId");
    if (!traceId || !runId) return;

    const missionId = str(data, "missionId");

    await this.open(traceId, `run:${runId}`, {
      name: str(data, "definitionId") ?? "workflow",
      kind: "workflow",
      traceId,
      // Parent to the mission when there is one, so the tree mirrors reality.
      parentSpanId: missionId ? this.tracer.openSpanId(`mission:${missionId}`) : undefined,
      attributes: { runId, missionId, definitionId: data.definitionId, version: data.version },
    });
  }

  private async onWorkflowEnd(data: Data, event: RyvanEvent, status: Span["status"]): Promise<void> {
    const traceId = this.traceIdOf(event, data);
    if (!traceId) return;

    await this.close(traceId, `run:${str(data, "runId")}`, {
      status,
      error: str(data, "error"),
    });
  }

  private async onStepStart(data: Data, event: RyvanEvent): Promise<void> {
    const traceId = this.traceIdOf(event, data);
    const runId = str(data, "runId");
    const stepId = str(data, "stepId");
    if (!traceId || !runId || !stepId) return;

    await this.open(traceId, `step:${runId}:${stepId}`, {
      name: str(data, "stepName") ?? stepId,
      kind: data.kind === "approval" ? "approval" : "step",
      traceId,
      parentSpanId: this.tracer.openSpanId(`run:${runId}`),
      attributes: { runId, stepId, stepKind: data.kind },
    });
  }

  private async onStepEnd(data: Data, event: RyvanEvent, status: Span["status"]): Promise<void> {
    const traceId = this.traceIdOf(event, data);
    if (!traceId) return;

    await this.close(traceId, `step:${str(data, "runId")}:${str(data, "stepId")}`, {
      status,
      error: str(data, "error"),
      attributes: { attempts: data.attempts },
    });
  }

  private async onModelStart(data: Data, event: RyvanEvent): Promise<void> {
    const traceId = this.traceIdOf(event, data);
    const requestId = str(data, "requestId");
    if (!traceId || !requestId) return;

    await this.open(traceId, `model:${requestId}`, {
      name: str(data, "model") ?? "model",
      kind: "model",
      traceId,
      parentSpanId: this.innermostOpen(traceId),
      attributes: { model: data.model, provider: data.provider, requestId },
    });
  }

  private async onModelEnd(data: Data, event: RyvanEvent): Promise<void> {
    const traceId = this.traceIdOf(event, data);
    const requestId = str(data, "requestId");
    if (!traceId || !requestId) return;

    const usage = (data.usage ?? {}) as Data;

    await this.close(traceId, `model:${requestId}`, {
      status: "ok",
      costUsd: num(usage, "estimatedCost"),
      tokens: num(usage, "totalTokens"),
      attributes: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        finishReason: data.finishReason,
      },
    });
  }

  /** Work that reports only a duration, so start and end arrive together. */
  private async onPointSpan(
    data: Data,
    event: RyvanEvent,
    kind: "tool" | "connector",
    success: boolean,
  ): Promise<void> {
    const traceId = this.traceIdOf(event, data);
    if (!traceId) return;

    const name =
      kind === "tool"
        ? (str(data, "toolName") ?? "tool")
        : `${str(data, "connectorId") ?? "connector"}.${str(data, "operation") ?? "execute"}`;

    await this.tracer.recordSpan({
      name,
      kind,
      traceId,
      parentSpanId: this.innermostOpen(traceId),
      durationMs: num(data, "executionTimeMs") ?? num(data, "latencyMs") ?? 0,
      status: success ? "ok" : "error",
      error: str(data, "error"),
      attributes: { ...data },
    });
  }

  // --- helpers --------------------------------------------------------------

  private subscribe(
    type: string,
    handler: (data: Data, event: RyvanEvent) => Promise<void>,
  ): void {
    if (!this.eventBus) return;

    this.subscriptions.push(
      // Returned so the bus awaits it: spans must be recorded before the emit
      // resolves, or a caller can read a trace that is missing the very span
      // the event it just awaited was about. The catch keeps tracing from ever
      // breaking the thing it observes.
      this.eventBus.on(type, (event: RyvanEvent) =>
        handler((event.data ?? {}) as Data, event).catch((err) => {
          this.logger?.error("Failed to record span", {
            type,
            error: err instanceof Error ? err.message : String(err),
          });
        }),
      ),
    );
  }

  /**
   * The trace id for an event. Prefers the bus `correlationId`; falls back to
   * one carried in the payload. Events with neither cannot be placed in a
   * trace and are skipped rather than guessed at.
   */
  private traceIdOf(event: RyvanEvent, data: Data): string | undefined {
    return event.correlationId ?? str(data, "correlationId") ?? str(data, "traceId");
  }

  private async open(
    traceId: string,
    key: string,
    options: Parameters<Tracer["startSpan"]>[0],
  ): Promise<void> {
    const span = await this.tracer.startSpan({ ...options, key });
    if (!span) return;

    const stack = this.openStacks.get(traceId) ?? [];
    stack.push(span.id);
    this.openStacks.set(traceId, stack);
  }

  private async close(
    traceId: string,
    key: string,
    options: Parameters<Tracer["endSpan"]>[1],
  ): Promise<void> {
    const spanId = this.tracer.openSpanId(key);
    const closed = await this.tracer.endByKey(key, options);
    if (!closed || !spanId) return;

    const stack = this.openStacks.get(traceId);
    if (!stack) return;

    const index = stack.lastIndexOf(spanId);
    if (index !== -1) stack.splice(index, 1);
    if (stack.length === 0) this.openStacks.delete(traceId);
  }

  /**
   * Best-effort parent for spans that carry no structural id of their own.
   *
   * A model or tool call reports which trace it belongs to but not which step
   * invoked it, so it is attached to the innermost span still open in that
   * trace. That is right in the common case of sequential work and can misplace
   * a call under concurrent steps — attributing it precisely needs the caller
   * to pass a parent span id, which `Tracer` accepts directly.
   */
  private innermostOpen(traceId: string): string | undefined {
    const stack = this.openStacks.get(traceId);
    return stack?.[stack.length - 1];
  }

  private async note(
    _event: RyvanEvent,
    key: string,
    name: string,
    attributes: Data,
  ): Promise<void> {
    const spanId = this.tracer.openSpanId(key);
    if (!spanId) return;

    await this.tracer.addEvent(spanId, name, attributes);
  }
}
