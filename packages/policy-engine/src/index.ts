export { PolicyEngine } from "./policy-engine.js";
export { BudgetGuard } from "./budget-guard.js";
export { QuotaGuard, InMemoryCounterStore } from "./quota-guard.js";
export {
  InMemoryApprovalStore,
  buildApproval,
  decideApproval,
  expireIfLapsed,
} from "./approvals.js";
export { PolicyService } from "./policy-service.js";
export { globToRegExp, matchesGlob, matchesCondition } from "./matcher.js";

// The ApprovalStore conformance suite is deliberately NOT re-exported here — it
// imports vitest, and the main barrel must stay free of test dependencies.
// Import it from "@ryvan/policy-engine/testing".

export type { ApprovalStore, RaiseApprovalInput } from "./approvals.js";
export type { QuotaLimit, QuotaStatus, QuotaPeriod, CounterStore } from "./quota-guard.js";

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
