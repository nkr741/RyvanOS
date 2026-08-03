import { deepClone } from "@ryvan/common";
import type { AuditEntry, AuditFilter, AuditStore } from "./types.js";

/** Process-local ledger storage, ordered by sequence. */
export class InMemoryAuditStore implements AuditStore {
  private readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(deepClone(entry));
  }

  async last(): Promise<AuditEntry | undefined> {
    const entry = this.entries[this.entries.length - 1];
    return entry ? deepClone(entry) : undefined;
  }

  async query(filter?: AuditFilter): Promise<AuditEntry[]> {
    let results = this.entries;

    if (filter?.action) {
      results = results.filter((entry) => entry.action === filter.action);
    }
    if (filter?.orgId) {
      results = results.filter((entry) => entry.actor.orgId === filter.orgId);
    }
    if (filter?.userId) {
      results = results.filter((entry) => entry.actor.userId === filter.userId);
    }
    if (filter?.agentId) {
      results = results.filter((entry) => entry.actor.agentId === filter.agentId);
    }
    if (filter?.correlationId) {
      results = results.filter((entry) => entry.correlationId === filter.correlationId);
    }
    if (filter?.outcome) {
      results = results.filter((entry) => entry.outcome === filter.outcome);
    }
    if (filter?.since !== undefined) {
      results = results.filter((entry) => entry.timestamp >= filter.since!);
    }
    if (filter?.until !== undefined) {
      results = results.filter((entry) => entry.timestamp <= filter.until!);
    }

    // `limit` keeps the most recent entries, but the chain is always returned
    // in sequence order so `verify()` can walk it.
    if (filter?.limit !== undefined && results.length > filter.limit) {
      results = results.slice(-filter.limit);
    }

    return results.map((entry) => deepClone(entry));
  }

  clear(): void {
    this.entries.length = 0;
  }
}
