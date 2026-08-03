export type AuditOutcome = "success" | "failure" | "denied" | "pending";

export interface AuditActor {
  userId?: string;
  agentId?: string;
  orgId?: string;
  projectId?: string;
  /** "user" | "agent" | "system" | "connector" — free-form, recorded as given. */
  kind?: string;
}

export interface AuditEntry {
  id: string;
  /** Position in the ledger, starting at 1. */
  sequence: number;
  timestamp: number;
  actor: AuditActor;
  /** What happened, e.g. "mission:completed", "connector:executed". */
  action: string;
  /** What it happened to, e.g. "mission:msn_123". */
  resource?: string;
  outcome: AuditOutcome;
  correlationId?: string;
  details?: Record<string, unknown>;
  /** Hash of the preceding entry — the empty string for the first. */
  previousHash: string;
  /** SHA-256 over this entry's content and `previousHash`. */
  hash: string;
}

export interface AppendAuditInput {
  actor?: AuditActor;
  action: string;
  resource?: string;
  outcome?: AuditOutcome;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export interface AuditFilter {
  action?: string;
  orgId?: string;
  userId?: string;
  agentId?: string;
  correlationId?: string;
  outcome?: AuditOutcome;
  since?: number;
  until?: number;
  limit?: number;
}

export interface AuditVerification {
  valid: boolean;
  entryCount: number;
  /** Sequence numbers whose hash or link does not check out. */
  brokenAt: number[];
}

/** Durability seam — a Postgres or object-store ledger implements the same three methods. */
export interface AuditStore {
  append(entry: AuditEntry): Promise<void>;
  query(filter?: AuditFilter): Promise<AuditEntry[]>;
  /** Most recent entry, used to chain the next one. */
  last(): Promise<AuditEntry | undefined>;
}

/**
 * Maps a platform event onto an audit entry. Returning undefined skips the event.
 */
export type AuditMapper = (
  type: string,
  data: Record<string, unknown>,
  correlationId?: string,
) => AppendAuditInput | undefined;

export interface AuditServiceOptions {
  store?: AuditStore;
  /**
   * Event types recorded automatically. Defaults to the platform's
   * security- and outcome-relevant events.
   */
  captureEvents?: string[];
  mapper?: AuditMapper;
  logger?: import("@ryvan/common").ILogger;
  eventBus?: import("@ryvan/events").IEventBus;
}
