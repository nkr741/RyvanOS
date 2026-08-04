/**
 * What kind of work a span represents. These are the layers a mission actually
 * passes through, which is what makes a trace readable rather than a flat log.
 */
export type SpanKind =
  | "mission"
  | "workflow"
  | "step"
  | "agent"
  | "tool"
  | "model"
  | "connector"
  | "approval"
  | "custom";

export type SpanStatus = "running" | "ok" | "error" | "cancelled";

/** A timestamped note attached to a span — a retry, an approval, a threshold. */
export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface Span {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  status: SpanStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  error?: string;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  /** Model spend attributed to this span. Rolls up to the trace. */
  costUsd?: number;
  tokens?: number;
}

/**
 * A whole trace: every span sharing a `traceId`, plus the totals worth seeing
 * without walking the tree.
 */
export interface Trace {
  traceId: string;
  rootSpanId?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: SpanStatus;
  spanCount: number;
  errorCount: number;
  totalCostUsd: number;
  totalTokens: number;
  /** Convenience labels lifted from the root span. */
  missionId?: string;
  orgId?: string;
}

/** A span and its children, for rendering a timeline. */
export interface SpanNode extends Span {
  children: SpanNode[];
}

export interface TraceFilter {
  traceId?: string;
  missionId?: string;
  orgId?: string;
  status?: SpanStatus;
  since?: number;
  until?: number;
  limit?: number;
}

/**
 * Durability seam. The in-memory implementation ships here; `@ryvan/persistence`
 * supplies a document-backed one.
 */
export interface TraceStore {
  save(span: Span): Promise<void>;
  get(spanId: string): Promise<Span | undefined>;
  /** Every span in a trace, oldest first. */
  spans(traceId: string): Promise<Span[]>;
  find(filter?: TraceFilter): Promise<Span[]>;
}

export interface StartSpanOptions {
  name: string;
  kind: SpanKind;
  traceId: string;
  parentSpanId?: string;
  attributes?: Record<string, unknown>;
  startedAt?: number;
  /** Stable key so a later event can find this span again. See `SpanIndex`. */
  key?: string;
}

export interface EndSpanOptions {
  status?: SpanStatus;
  error?: string;
  attributes?: Record<string, unknown>;
  costUsd?: number;
  tokens?: number;
  endedAt?: number;
}

export interface ObservabilityServiceOptions {
  store?: TraceStore;
  /**
   * Cap on spans retained per trace. A runaway workflow should not be able to
   * exhaust memory through the tracer. Default 2000.
   */
  maxSpansPerTrace?: number;
  logger?: import("@ryvan/common").ILogger;
  eventBus?: import("@ryvan/events").IEventBus;
}
