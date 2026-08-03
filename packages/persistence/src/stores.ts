import type { DocumentStore } from "@ryvan/storage";
import type { WorkflowRun, WorkflowRunStatus, WorkflowStore } from "@ryvan/workflow-engine";
import type { Mission, MissionStatus, MissionStore } from "@ryvan/mission-engine";
import type { AuditEntry, AuditFilter, AuditStore } from "@ryvan/audit";

/**
 * Durable domain stores.
 *
 * Each is written against the generic `DocumentStore` port rather than against
 * Postgres directly, so the same class runs on the in-memory driver in tests
 * and on Postgres in production. Swapping the driver is a bootstrap concern,
 * not a rewrite.
 *
 * This package is allowed to import several domain packages because it is an
 * integration layer, exactly like `@ryvan/bootstrap`. Domain packages still
 * import nothing from each other.
 */

export const COLLECTIONS = {
  workflowRuns: "workflow_runs",
  missions: "missions",
  auditEntries: "audit_entries",
  memoryEntries: "memory_entries",
} as const;

/** Durable `WorkflowStore`, so a suspended run survives a restart. */
export class DocumentWorkflowStore implements WorkflowStore {
  constructor(private readonly documents: DocumentStore) {}

  async save(run: WorkflowRun): Promise<void> {
    await this.documents.put(COLLECTIONS.workflowRuns, run);
  }

  async get(runId: string): Promise<WorkflowRun | undefined> {
    return this.documents.get<WorkflowRun>(COLLECTIONS.workflowRuns, runId);
  }

  async list(filter?: {
    status?: WorkflowRunStatus;
    definitionId?: string;
    missionId?: string;
  }): Promise<WorkflowRun[]> {
    const where: Record<string, unknown> = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.definitionId) where.definitionId = filter.definitionId;
    if (filter?.missionId) where.missionId = filter.missionId;

    return this.documents.find<WorkflowRun>(COLLECTIONS.workflowRuns, {
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: "createdAt",
      direction: "asc",
    });
  }
}

/** Durable `MissionStore`. */
export class DocumentMissionStore implements MissionStore {
  constructor(private readonly documents: DocumentStore) {}

  async save(mission: Mission): Promise<void> {
    await this.documents.put(COLLECTIONS.missions, mission);
  }

  async get(missionId: string): Promise<Mission | undefined> {
    return this.documents.get<Mission>(COLLECTIONS.missions, missionId);
  }

  async list(filter?: {
    status?: MissionStatus;
    type?: string;
    orgId?: string;
    runId?: string;
  }): Promise<Mission[]> {
    const where: Record<string, unknown> = {};
    if (filter?.status) where.status = filter.status;
    if (filter?.type) where.type = filter.type;
    // Nested path — the document drivers expand dotted keys on both sides.
    if (filter?.orgId) where["subject.orgId"] = filter.orgId;
    if (filter?.runId) where.runId = filter.runId;

    return this.documents.find<Mission>(COLLECTIONS.missions, {
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: "createdAt",
      direction: "asc",
    });
  }
}

/**
 * Durable `AuditStore`.
 *
 * `query()` must return entries in sequence order regardless of filter, because
 * `AuditLedger.verify()` walks the result to check the hash chain. Returning
 * them in storage order — or newest-first — would break verification on a
 * ledger that is perfectly intact.
 */
export class DocumentAuditStore implements AuditStore {
  constructor(private readonly documents: DocumentStore) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.documents.put(COLLECTIONS.auditEntries, entry);
  }

  async last(): Promise<AuditEntry | undefined> {
    const [latest] = await this.documents.find<AuditEntry>(COLLECTIONS.auditEntries, {
      orderBy: "sequence",
      direction: "desc",
      limit: 1,
    });
    return latest;
  }

  async query(filter?: AuditFilter): Promise<AuditEntry[]> {
    const where: Record<string, unknown> = {};
    if (filter?.action) where.action = filter.action;
    if (filter?.outcome) where.outcome = filter.outcome;
    if (filter?.correlationId) where.correlationId = filter.correlationId;
    if (filter?.orgId) where["actor.orgId"] = filter.orgId;
    if (filter?.userId) where["actor.userId"] = filter.userId;
    if (filter?.agentId) where["actor.agentId"] = filter.agentId;

    let entries = await this.documents.find<AuditEntry>(COLLECTIONS.auditEntries, {
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: "sequence",
      direction: "asc",
    });

    // Time bounds are ranges, which the document port only expresses as
    // equality, so they are applied here.
    if (filter?.since !== undefined) {
      entries = entries.filter((entry) => entry.timestamp >= filter.since!);
    }
    if (filter?.until !== undefined) {
      entries = entries.filter((entry) => entry.timestamp <= filter.until!);
    }

    // `limit` keeps the most recent entries but preserves ascending order, so
    // the chain stays walkable.
    if (filter?.limit !== undefined && entries.length > filter.limit) {
      entries = entries.slice(-filter.limit);
    }

    return entries;
  }
}
