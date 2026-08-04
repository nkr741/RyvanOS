import type { DocumentStore } from "@ryvan/storage";
import type { Span, TraceFilter, TraceStore } from "@ryvan/observability";

const COLLECTION = "spans";

/**
 * Durable trace store.
 *
 * Traces are the record of what a mission actually did, so they need to outlive
 * the process that produced them — a trace you can only read until the next
 * deploy is not much use when someone asks why last Tuesday's payroll failed.
 */
export class DocumentTraceStore implements TraceStore {
  constructor(private readonly documents: DocumentStore) {}

  async save(span: Span): Promise<void> {
    await this.documents.put(COLLECTION, span);
  }

  async get(spanId: string): Promise<Span | undefined> {
    return this.documents.get<Span>(COLLECTION, spanId);
  }

  async spans(traceId: string): Promise<Span[]> {
    return this.documents.find<Span>(COLLECTION, {
      where: { traceId },
      orderBy: "startedAt",
      direction: "asc",
    });
  }

  async find(filter?: TraceFilter): Promise<Span[]> {
    const where: Record<string, unknown> = {};
    if (filter?.traceId) where.traceId = filter.traceId;
    if (filter?.status) where.status = filter.status;
    // Attributes are nested; the document drivers expand dotted keys.
    if (filter?.missionId) where["attributes.missionId"] = filter.missionId;
    if (filter?.orgId) where["attributes.orgId"] = filter.orgId;

    let spans = await this.documents.find<Span>(COLLECTION, {
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: "startedAt",
      direction: "asc",
    });

    // Time bounds are ranges, which the document port expresses only as equality.
    if (filter?.since !== undefined) {
      spans = spans.filter((span) => span.startedAt >= filter.since!);
    }
    if (filter?.until !== undefined) {
      spans = spans.filter((span) => span.startedAt <= filter.until!);
    }

    if (filter?.limit !== undefined && spans.length > filter.limit) {
      spans = spans.slice(-filter.limit);
    }

    return spans;
  }
}
