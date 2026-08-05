/**
 * What the console reads and does.
 *
 * Declared as ports rather than importing the eight services this presents, so
 * the console stays testable without booting a platform and depends on no
 * domain package. `@ryvan/bootstrap` supplies the implementations.
 *
 * Every shape here is deliberately loose — the console renders what it is
 * given. Tightening these to the real domain types would couple the console's
 * release to every one of theirs.
 */

export interface ConsoleMission {
  id: string;
  type: string;
  name: string;
  goal: string;
  status: string;
  runId?: string;
  approvalId?: string;
  correlationId: string;
  error?: string;
  result?: unknown;
  subject?: { userId?: string; orgId?: string };
  createdAt: number;
  completedAt?: number;
}

export interface ConsoleSpan {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  status: string;
  startedAt: number;
  durationMs?: number;
  error?: string;
  costUsd?: number;
  tokens?: number;
  children?: ConsoleSpan[];
}

export interface ConsoleTrace {
  traceId: string;
  status: string;
  durationMs?: number;
  spanCount: number;
  errorCount: number;
  totalCostUsd: number;
  totalTokens: number;
  missionId?: string;
  orgId?: string;
  startedAt: number;
}

export interface ConsoleApproval {
  id: string;
  action: string;
  resource?: string;
  reason: string;
  status: string;
  requestedAt: number;
  expiresAt: number;
  subject?: { userId?: string; orgId?: string };
}

export interface ConsoleAuditEntry {
  id: string;
  sequence: number;
  timestamp: number;
  action: string;
  resource?: string;
  outcome: string;
  actor: Record<string, unknown>;
  correlationId?: string;
}

export interface ConsoleCircuit {
  key: string;
  state: string;
  consecutiveFailures: number;
  totalCalls: number;
  totalFailures: number;
  lastError?: string;
  retryAt?: number;
}

export interface ConsoleDeadLetter {
  id: string;
  key: string;
  error: string;
  attempts: number;
  createdAt: number;
  replayedAt?: number;
}

export interface ConsoleWorkflowRun {
  id: string;
  definitionId: string;
  status: string;
  missionId?: string;
  correlationId: string;
  error?: string;
  createdAt: number;
  steps: Record<string, { id: string; status: string; attempts: number; error?: string }>;
}

export interface ConsoleConnector {
  id: string;
  vendor: string;
  version: string;
  health: { status: string; latencyMs?: number; message?: string; checkedAt: number };
  operations: { name: string; mutates?: boolean }[];
}

/** Everything the console can read. All optional — it renders what it is given. */
export interface ConsoleSources {
  missions?: {
    list(filter?: { status?: string; orgId?: string }): Promise<ConsoleMission[]>;
    get(id: string): Promise<ConsoleMission | undefined>;
    cancel(id: string): Promise<ConsoleMission>;
  };
  traces?: {
    list(filter?: { orgId?: string; limit?: number }): Promise<ConsoleTrace[]>;
    get(traceId: string): Promise<ConsoleTrace | undefined>;
    tree(traceId: string): Promise<ConsoleSpan[]>;
  };
  workflows?: {
    list(filter?: { status?: string }): Promise<ConsoleWorkflowRun[]>;
    get(runId: string): Promise<ConsoleWorkflowRun | undefined>;
  };
  approvals?: {
    pending(): Promise<ConsoleApproval[]>;
    grant(id: string, decidedBy: string, note?: string): Promise<ConsoleApproval>;
    deny(id: string, decidedBy: string, note?: string): Promise<ConsoleApproval>;
  };
  audit?: {
    query(filter?: { orgId?: string; limit?: number }): Promise<ConsoleAuditEntry[]>;
    verify(): Promise<{ valid: boolean; entryCount: number; brokenAt: number[] }>;
  };
  policies?: {
    rules(): { id: string; name: string; effect: string; enabled?: boolean }[];
    budgets(): { id: string; limitUsd: number; spentUsd: number; period: string }[];
  };
  circuits?: {
    list(): ConsoleCircuit[];
    reset(key: string): void;
  };
  deadLetters?: {
    list(filter?: { replayed?: boolean }): Promise<ConsoleDeadLetter[]>;
  };
  connectors?: {
    list(): ConsoleConnector[];
  };
  health?: {
    services(): { name: string; status: string }[];
    storage(): Promise<{ kind: string; reachable: boolean; latencyMs?: number }[]>;
  };
}

export interface ConsoleRequest {
  method: string;
  /** Path with no query string, e.g. "/api/missions". */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

export interface ConsoleResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface ConsoleOptions {
  sources: ConsoleSources;
  /**
   * Bearer token required on every request.
   *
   * Mandatory, and there is no "disable auth" switch. The console exposes the
   * audit trail, every mission's inputs, and the ability to grant approvals —
   * an accidentally unauthenticated deployment of it is a breach, so the
   * failure mode is "will not start" rather than "wide open".
   */
  token: string;
  /** Mount prefix, so it can sit under an existing app. Default "". */
  basePath?: string;
  logger?: import("@ryvan/common").ILogger;
}
