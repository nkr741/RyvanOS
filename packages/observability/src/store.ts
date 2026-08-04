import { deepClone } from "@ryvan/common";
import type { Span, TraceFilter, TraceStore } from "./types.js";

/** Process-local span storage, indexed by trace so timeline reads stay cheap. */
export class InMemoryTraceStore implements TraceStore {
  private readonly spansById = new Map<string, Span>();
  private readonly byTrace = new Map<string, Set<string>>();

  async save(span: Span): Promise<void> {
    this.spansById.set(span.id, deepClone(span));

    let ids = this.byTrace.get(span.traceId);
    if (!ids) {
      ids = new Set();
      this.byTrace.set(span.traceId, ids);
    }
    ids.add(span.id);
  }

  async get(spanId: string): Promise<Span | undefined> {
    const span = this.spansById.get(spanId);
    return span ? deepClone(span) : undefined;
  }

  async spans(traceId: string): Promise<Span[]> {
    const ids = this.byTrace.get(traceId);
    if (!ids) return [];

    return Array.from(ids)
      .map((id) => this.spansById.get(id))
      .filter((span): span is Span => span !== undefined)
      .map((span) => deepClone(span))
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  async find(filter?: TraceFilter): Promise<Span[]> {
    let spans = Array.from(this.spansById.values());

    if (filter?.traceId) {
      spans = spans.filter((span) => span.traceId === filter.traceId);
    }
    if (filter?.missionId) {
      spans = spans.filter((span) => span.attributes.missionId === filter.missionId);
    }
    if (filter?.orgId) {
      spans = spans.filter((span) => span.attributes.orgId === filter.orgId);
    }
    if (filter?.status) {
      spans = spans.filter((span) => span.status === filter.status);
    }
    if (filter?.since !== undefined) {
      spans = spans.filter((span) => span.startedAt >= filter.since!);
    }
    if (filter?.until !== undefined) {
      spans = spans.filter((span) => span.startedAt <= filter.until!);
    }

    spans = spans.sort((a, b) => a.startedAt - b.startedAt);

    if (filter?.limit !== undefined && spans.length > filter.limit) {
      spans = spans.slice(-filter.limit);
    }

    return spans.map((span) => deepClone(span));
  }

  clear(): void {
    this.spansById.clear();
    this.byTrace.clear();
  }
}
