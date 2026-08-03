/**
 * Policy effects, ordered by strength. When two rules of equal priority match,
 * the stronger effect wins: deny > require_approval > allow.
 */
export type PolicyEffect = "allow" | "deny" | "require_approval";

/**
 * Who (or what) is attempting the action. Roles are supplied by the caller —
 * this package never stores users or roles. That is `@ryvan/identity`'s job.
 */
export interface PolicySubject {
  userId?: string;
  agentId?: string;
  orgId?: string;
  projectId?: string;
  roles?: string[];
}

export interface PolicyRequest {
  /** Dot- or colon-namespaced action, e.g. "mission:execute", "tool:send_email". */
  action: string;
  /** Optional target of the action, e.g. "connector:salesforce". */
  resource?: string;
  subject: PolicySubject;
  /** Arbitrary facts a rule can match on (environment, data class, amount...). */
  attributes?: Record<string, unknown>;
  /** Projected spend for this action, checked against budget limits. */
  estimatedCostUsd?: number;
}

/**
 * Declarative match conditions. All present fields must match (AND).
 * Within a field, any entry may match (OR). Omitted fields match everything.
 */
export interface PolicyCondition {
  /** Glob patterns matched against `action`, e.g. "tool:*", "mission:execute". */
  actions?: string[];
  /** Glob patterns matched against `resource`. */
  resources?: string[];
  /** Subject must hold at least one of these roles. */
  roles?: string[];
  agentIds?: string[];
  orgIds?: string[];
  /** Matches when `estimatedCostUsd` is greater than this value. */
  costAboveUsd?: number;
  /** Exact-equality checks against `request.attributes`. */
  attributes?: Record<string, unknown>;
  /** Escape hatch for logic the declarative form cannot express. */
  predicate?: (request: PolicyRequest) => boolean;
}

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  effect: PolicyEffect;
  when: PolicyCondition;
  /** Higher wins. Rules default to 0. */
  priority?: number;
  /** Human-readable justification surfaced in the decision. */
  reason?: string;
  enabled?: boolean;
}

export interface PolicyDecision {
  effect: PolicyEffect;
  /** Convenience flag — true only when `effect === "allow"`. */
  allowed: boolean;
  reason: string;
  matchedRuleIds: string[];
  /** Set when `effect === "require_approval"` and an approval was raised. */
  approvalId?: string;
  /** Present when a budget limit contributed to the decision. */
  budget?: BudgetStatus;
  evaluatedAt: number;
}

export type BudgetPeriod = "hour" | "day" | "month" | "total";

export interface BudgetScope {
  orgId?: string;
  userId?: string;
  agentId?: string;
}

export interface BudgetLimit {
  id: string;
  scope: BudgetScope;
  period: BudgetPeriod;
  limitUsd: number;
  /** Fraction of the limit (0-1) at which COST_THRESHOLD is emitted. Default 0.8. */
  warnAtFraction?: number;
}

export interface BudgetStatus {
  limitId: string;
  limitUsd: number;
  spentUsd: number;
  remainingUsd: number;
  period: BudgetPeriod;
  exceeded: boolean;
}

export interface SpendRecord {
  scope: BudgetScope;
  amountUsd: number;
  timestamp: number;
  reason?: string;
}

export type ApprovalStatus = "pending" | "granted" | "denied" | "expired";

export interface ApprovalRequest {
  id: string;
  action: string;
  resource?: string;
  subject: PolicySubject;
  reason: string;
  status: ApprovalStatus;
  requestedAt: number;
  expiresAt: number;
  decidedAt?: number;
  decidedBy?: string;
  decisionNote?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyEngineOptions {
  /** Effect applied when no rule matches. Default "allow". */
  defaultEffect?: PolicyEffect;
  rules?: PolicyRule[];
}

export interface PolicyServiceOptions extends PolicyEngineOptions {
  budgets?: BudgetLimit[];
  /** How long a raised approval stays pending before expiring. Default 24h. */
  approvalTtlMs?: number;
  /**
   * Where approvals live. Defaults to an in-memory store, which loses pending
   * approvals on restart — supply a durable one for production.
   */
  approvalStore?: import("./approvals.js").ApprovalStore;
  logger?: import("@ryvan/common").ILogger;
  eventBus?: import("@ryvan/events").IEventBus;
}
