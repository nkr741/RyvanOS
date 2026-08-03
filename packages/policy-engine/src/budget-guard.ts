import { ValidationError } from "@ryvan/common";
import type { BudgetLimit, BudgetScope, BudgetStatus, SpendRecord } from "./types.js";

const PERIOD_MS: Record<BudgetLimit["period"], number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  total: Number.POSITIVE_INFINITY,
};

const DEFAULT_WARN_FRACTION = 0.8;
const DEFAULT_MAX_RECORDS = 50_000;

/**
 * Enforces spend ceilings.
 *
 * This is deliberately separate from `CostTracker` in `@ryvan/models`:
 * CostTracker *observes* what model calls cost, the BudgetGuard *decides*
 * whether more spend is permitted, across any cost source (models, connectors,
 * external APIs). Bootstrap bridges the two by feeding model usage in here.
 *
 * Periods are rolling windows measured back from now, not calendar boundaries —
 * this keeps the result timezone-independent.
 */
export class BudgetGuard {
  private readonly limits = new Map<string, BudgetLimit>();
  private records: SpendRecord[] = [];
  private readonly maxRecords: number;
  private readonly warned = new Set<string>();

  constructor(limits: BudgetLimit[] = [], maxRecords = DEFAULT_MAX_RECORDS) {
    this.maxRecords = maxRecords;
    for (const limit of limits) {
      this.setLimit(limit);
    }
  }

  setLimit(limit: BudgetLimit): void {
    if (!limit.id) {
      throw new ValidationError("limit.id", "must not be empty");
    }
    if (!Number.isFinite(limit.limitUsd) || limit.limitUsd < 0) {
      throw new ValidationError("limit.limitUsd", "must be a non-negative finite number");
    }
    if (!(limit.period in PERIOD_MS)) {
      throw new ValidationError("limit.period", `unknown period "${limit.period}"`);
    }
    this.limits.set(limit.id, limit);
    this.warned.delete(limit.id);
  }

  removeLimit(limitId: string): boolean {
    this.warned.delete(limitId);
    return this.limits.delete(limitId);
  }

  listLimits(): BudgetLimit[] {
    return Array.from(this.limits.values());
  }

  /** Records spend. Non-finite or negative amounts are ignored rather than throwing. */
  record(scope: BudgetScope, amountUsd: number, reason?: string): void {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return;

    this.records.push({ scope, amountUsd, timestamp: Date.now(), reason });

    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
    }
  }

  spentUsd(scope: BudgetScope, period: BudgetLimit["period"]): number {
    const windowMs = PERIOD_MS[period];
    const since = windowMs === Number.POSITIVE_INFINITY ? 0 : Date.now() - windowMs;

    return this.records
      .filter((record) => record.timestamp >= since && this.scopeCovers(scope, record.scope))
      .reduce((sum, record) => sum + record.amountUsd, 0);
  }

  status(limitId: string): BudgetStatus {
    const limit = this.limits.get(limitId);
    if (!limit) {
      throw new ValidationError("limitId", `budget limit "${limitId}" does not exist`);
    }
    return this.statusFor(limit);
  }

  /**
   * Returns every limit whose scope applies to this request, ordered most
   * constrained first. Callers use this to decide and to report *which* budget bit.
   */
  check(scope: BudgetScope, additionalUsd = 0): BudgetStatus[] {
    const applicable: BudgetStatus[] = [];

    for (const limit of this.limits.values()) {
      if (!this.scopeCovers(limit.scope, scope)) continue;

      const status = this.statusFor(limit, additionalUsd);
      applicable.push(status);
    }

    return applicable.sort((a, b) => a.remainingUsd - b.remainingUsd);
  }

  /**
   * Limits that have crossed their warn threshold but are not yet exceeded,
   * reported once each until spend resets or the limit is redefined.
   */
  takeNewWarnings(): BudgetStatus[] {
    const warnings: BudgetStatus[] = [];

    for (const limit of this.limits.values()) {
      const status = this.statusFor(limit);
      const fraction = limit.warnAtFraction ?? DEFAULT_WARN_FRACTION;
      const threshold = limit.limitUsd * fraction;

      if (status.exceeded || status.spentUsd < threshold) {
        if (status.spentUsd < threshold) this.warned.delete(limit.id);
        continue;
      }
      if (this.warned.has(limit.id)) continue;

      this.warned.add(limit.id);
      warnings.push(status);
    }

    return warnings;
  }

  reset(): void {
    this.records = [];
    this.warned.clear();
  }

  private statusFor(limit: BudgetLimit, additionalUsd = 0): BudgetStatus {
    const spentUsd = this.spentUsd(limit.scope, limit.period) + additionalUsd;
    const remainingUsd = limit.limitUsd - spentUsd;

    return {
      limitId: limit.id,
      limitUsd: limit.limitUsd,
      spentUsd,
      remainingUsd,
      period: limit.period,
      exceeded: spentUsd > limit.limitUsd,
    };
  }

  /**
   * True when `limitScope` applies to `candidate`. A limit field left undefined
   * is a wildcard, so `{ orgId: "acme" }` covers every user and agent in Acme.
   */
  private scopeCovers(limitScope: BudgetScope, candidate: BudgetScope): boolean {
    if (limitScope.orgId !== undefined && limitScope.orgId !== candidate.orgId) return false;
    if (limitScope.userId !== undefined && limitScope.userId !== candidate.userId) return false;
    if (limitScope.agentId !== undefined && limitScope.agentId !== candidate.agentId) return false;
    return true;
  }
}
