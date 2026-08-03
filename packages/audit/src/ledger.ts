import { createHash } from "node:crypto";
import { ValidationError, generateId } from "@ryvan/common";
import { InMemoryAuditStore } from "./store.js";
import type {
  AppendAuditInput,
  AuditEntry,
  AuditFilter,
  AuditStore,
  AuditVerification,
} from "./types.js";

/**
 * Content hash for an entry. Every field that carries meaning is included, so
 * altering any of them — including the link to the previous entry — invalidates
 * the chain from that point onward.
 */
export function hashEntry(entry: Omit<AuditEntry, "hash">): string {
  const canonical = JSON.stringify({
    id: entry.id,
    sequence: entry.sequence,
    timestamp: entry.timestamp,
    actor: entry.actor,
    action: entry.action,
    resource: entry.resource ?? null,
    outcome: entry.outcome,
    correlationId: entry.correlationId ?? null,
    details: entry.details ?? null,
    previousHash: entry.previousHash,
  });

  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Append-only, hash-chained ledger.
 *
 * Each entry commits to its predecessor's hash, so a single altered or removed
 * record is detectable by `verify()`. That is what makes the log evidence
 * rather than just history — the property regulated customers ask for.
 *
 * Appends are serialised: concurrent callers would otherwise read the same
 * `last()` and produce two entries claiming the same predecessor.
 */
export class AuditLedger {
  private readonly store: AuditStore;
  private tail: Promise<AuditEntry | void> = Promise.resolve();

  constructor(store: AuditStore = new InMemoryAuditStore()) {
    this.store = store;
  }

  async append(input: AppendAuditInput): Promise<AuditEntry> {
    if (!input.action) {
      throw new ValidationError("action", "must not be empty");
    }

    const next = this.tail.then(() => this.appendUnsafe(input));
    // Keep the chain alive even if this append rejects.
    this.tail = next.catch(() => undefined);
    return next;
  }

  async query(filter?: AuditFilter): Promise<AuditEntry[]> {
    return this.store.query(filter);
  }

  /** Walks the chain and reports any entry whose hash or link fails to check out. */
  async verify(): Promise<AuditVerification> {
    const entries = await this.store.query();
    const brokenAt: number[] = [];

    let previousHash = "";

    for (const entry of entries) {
      const { hash, ...content } = entry;

      if (entry.previousHash !== previousHash || hashEntry(content) !== hash) {
        brokenAt.push(entry.sequence);
      }

      previousHash = entry.hash;
    }

    return { valid: brokenAt.length === 0, entryCount: entries.length, brokenAt };
  }

  private async appendUnsafe(input: AppendAuditInput): Promise<AuditEntry> {
    const previous = await this.store.last();

    const content: Omit<AuditEntry, "hash"> = {
      id: generateId("aud"),
      sequence: (previous?.sequence ?? 0) + 1,
      timestamp: Date.now(),
      actor: input.actor ?? { kind: "system" },
      action: input.action,
      resource: input.resource,
      outcome: input.outcome ?? "success",
      correlationId: input.correlationId,
      details: input.details,
      previousHash: previous?.hash ?? "",
    };

    const entry: AuditEntry = { ...content, hash: hashEntry(content) };
    await this.store.append(entry);

    return entry;
  }
}
