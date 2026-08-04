import { ValidationError, generateId } from "@ryvan/common";
import { InMemoryTraceStore } from "./store.js";
import type {
  EndSpanOptions,
  Span,
  SpanNode,
  StartSpanOptions,
  Trace,
  TraceFilter,
  TraceStore,
} from "./types.js";

const DEFAULT_MAX_SPANS_PER_TRACE = 2000;

/**
 * Creates and closes spans.
 *
 * Spans are keyed so a later, unrelated event can find the one it belongs to:
 * the platform's events arrive as independent "started" and "completed" pairs
 * with no handle passed between them, so the tracer needs to look a span up by
 * something both events know — a run id, a step id, a model request id.
 */
export class Tracer {
  private readonly store: TraceStore;
  private readonly maxSpansPerTrace: number;
  /** key -> spanId, for spans still open. */
  private readonly openByKey = new Map<string, string>();
  private readonly spanCountByTrace = new Map<string, number>();

  constructor(
    store: TraceStore = new InMemoryTraceStore(),
    maxSpansPerTrace = DEFAULT_MAX_SPANS_PER_TRACE,
  ) {
    this.store = store;
    this.maxSpansPerTrace = maxSpansPerTrace;
  }

  async startSpan(options: StartSpanOptions): Promise<Span | undefined> {
    if (!options.traceId) {
      throw new ValidationError("traceId", "must not be empty");
    }
    if (!options.name) {
      throw new ValidationError("name", "must not be empty");
    }

    const count = this.spanCountByTrace.get(options.traceId) ?? 0;
    if (count >= this.maxSpansPerTrace) {
      // Dropping is better than unbounded growth: a runaway loop must not be
      // able to exhaust memory through the very system meant to observe it.
      return undefined;
    }

    const span: Span = {
      id: generateId("span"),
      traceId: options.traceId,
      parentSpanId: options.parentSpanId,
      name: options.name,
      kind: options.kind,
      status: "running",
      startedAt: options.startedAt ?? Date.now(),
      attributes: options.attributes ?? {},
      events: [],
    };

    await this.store.save(span);
    this.spanCountByTrace.set(options.traceId, count + 1);

    if (options.key) {
      this.openByKey.set(options.key, span.id);
    }

    return span;
  }

  /** Closes a span by id. Returns undefined if it is unknown or already closed. */
  async endSpan(spanId: string, options: EndSpanOptions = {}): Promise<Span | undefined> {
    const span = await this.store.get(spanId);
    if (!span || span.status !== "running") return undefined;

    const endedAt = options.endedAt ?? Date.now();

    const closed: Span = {
      ...span,
      status: options.status ?? "ok",
      endedAt,
      durationMs: endedAt - span.startedAt,
      error: options.error,
      attributes: { ...span.attributes, ...options.attributes },
      costUsd: options.costUsd ?? span.costUsd,
      tokens: options.tokens ?? span.tokens,
    };

    await this.store.save(closed);
    return closed;
  }

  /** Closes the span registered under `key`, if one is open. */
  async endByKey(key: string, options: EndSpanOptions = {}): Promise<Span | undefined> {
    const spanId = this.openByKey.get(key);
    if (!spanId) return undefined;

    this.openByKey.delete(key);
    return this.endSpan(spanId, options);
  }

  /** The still-open span registered under `key`. */
  async openSpan(key: string): Promise<Span | undefined> {
    const spanId = this.openByKey.get(key);
    return spanId ? this.store.get(spanId) : undefined;
  }

  openSpanId(key: string): string | undefined {
    return this.openByKey.get(key);
  }

  /** Records a one-shot span for work that reports only its duration. */
  async recordSpan(
    options: StartSpanOptions & EndSpanOptions & { durationMs?: number },
  ): Promise<Span | undefined> {
    const endedAt = options.endedAt ?? Date.now();
    const startedAt =
      options.startedAt ??
      (options.durationMs !== undefined ? endedAt - options.durationMs : endedAt);

    const span = await this.startSpan({ ...options, startedAt });
    if (!span) return undefined;

    return this.endSpan(span.id, { ...options, endedAt });
  }

  async addEvent(
    spanId: string,
    name: string,
    attributes?: Record<string, unknown>,
  ): Promise<void> {
    const span = await this.store.get(spanId);
    if (!span) return;

    await this.store.save({
      ...span,
      events: [...span.events, { name, timestamp: Date.now(), attributes }],
    });
  }

  async spans(traceId: string): Promise<Span[]> {
    return this.store.spans(traceId);
  }

  async findSpans(filter?: TraceFilter): Promise<Span[]> {
    return this.store.find(filter);
  }

  /**
   * Rolls a trace up. Cost and tokens sum across every span, so a mission's
   * total spend is available without walking the tree.
   */
  async trace(traceId: string): Promise<Trace | undefined> {
    const spans = await this.store.spans(traceId);
    if (spans.length === 0) return undefined;

    const root = spans.find((span) => !span.parentSpanId) ?? spans[0]!;
    const startedAt = Math.min(...spans.map((span) => span.startedAt));

    const allClosed = spans.every((span) => span.endedAt !== undefined);
    const endedAt = allClosed ? Math.max(...spans.map((span) => span.endedAt!)) : undefined;

    const errorCount = spans.filter((span) => span.status === "error").length;

    return {
      traceId,
      rootSpanId: root.id,
      startedAt,
      endedAt,
      durationMs: endedAt !== undefined ? endedAt - startedAt : undefined,
      status: this.rollUpStatus(spans, errorCount),
      spanCount: spans.length,
      errorCount,
      totalCostUsd: spans.reduce((sum, span) => sum + (span.costUsd ?? 0), 0),
      totalTokens: spans.reduce((sum, span) => sum + (span.tokens ?? 0), 0),
      missionId: root.attributes.missionId as string | undefined,
      orgId: root.attributes.orgId as string | undefined,
    };
  }

  /** The trace as a tree, ready to render as a timeline. */
  async tree(traceId: string): Promise<SpanNode[]> {
    const spans = await this.store.spans(traceId);

    const nodes = new Map<string, SpanNode>(
      spans.map((span) => [span.id, { ...span, children: [] }]),
    );

    const roots: SpanNode[] = [];

    for (const node of nodes.values()) {
      const parent = node.parentSpanId ? nodes.get(node.parentSpanId) : undefined;
      // A span whose parent was dropped or never recorded is promoted to a root
      // rather than vanishing from the tree.
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    for (const node of nodes.values()) {
      node.children.sort((a, b) => a.startedAt - b.startedAt);
    }

    return roots.sort((a, b) => a.startedAt - b.startedAt);
  }

  private rollUpStatus(spans: Span[], errorCount: number): Span["status"] {
    if (spans.some((span) => span.status === "running")) return "running";
    if (errorCount > 0) return "error";
    if (spans.some((span) => span.status === "cancelled")) return "cancelled";
    return "ok";
  }
}
