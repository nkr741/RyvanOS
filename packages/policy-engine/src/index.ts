export { PolicyEngine } from "./policy-engine.js";
export { BudgetGuard } from "./budget-guard.js";
export { ApprovalStore } from "./approvals.js";
export { PolicyService } from "./policy-service.js";
export { globToRegExp, matchesGlob, matchesCondition } from "./matcher.js";

export type { RaiseApprovalInput } from "./approvals.js";

export type {
  PolicyEffect,
  PolicySubject,
  PolicyRequest,
  PolicyCondition,
  PolicyRule,
  PolicyDecision,
  PolicyEngineOptions,
  PolicyServiceOptions,
  BudgetPeriod,
  BudgetScope,
  BudgetLimit,
  BudgetStatus,
  SpendRecord,
  ApprovalStatus,
  ApprovalRequest,
} from "./types.js";
