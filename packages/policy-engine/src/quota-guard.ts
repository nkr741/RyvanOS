import { ValidationError } from "@ryvan/common";
import type { BudgetScope } from "./types.js";

export type QuotaPeriod = "minute" | "hour" | "day" | "month";

export interface QuotaLimit {
  id: string;
  /** What is being counted, e.g. "missions", "connector.calls", "tools". */
  resource: string;
  scope: BudgetScope;
  period: QuotaPeriod;
  limit: number;
  /** Fraction of the limit (0-1) at which a warning is raised. Default 0.8. */
  warnAtFraction?: number;
}

export interface QuotaStatus {
  limitId: string;
  resource: string;
  period: QuotaPeriod;
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  /** Epoch ms when the current window rolls over. */
  resetsAt: number;
}

/**
 * Counter storage.
 *
 * A port rather than a direct dependency on `@ryvan/storage`, both because
 * domain packages import no other domain package and because the counters must
 * be shared across processes to mean anything — Redis in production, a map in
 * tests. `KeyValueStore.increment` already provides exactly this.
 */
export interface CounterStore {
  increment(key: string, by: number, ttlMs: number): Promise<number>;
  read(key: string): Promise<number>;
}

/** Process-local counters. Correct for tests, wrong across replicas. */
export class InMemoryCounterStore implements CounterStore {
  private readonly counters = new Map<string, { value: number; expiresAt: number }>();

  async increment(key: string, by: number, ttlMs: number): Promise<number> {
    const existing = this.read_(key);
    const next = (existing ?? 0) + by;

    this.counters.set(key, {
      value: next,
      // The deadline is set once per window, so incrementing does not extend it.
      expiresAt: existing === undefined ? Date.now() + ttlMs : this.counters.get(key)!.expiresAt,
    });

    return next;
  }

  async read(key: string): Promise<number> {
    return this.read_(key) ?? 0;
  }

  private read_(key: string): number | undefined {
    const entry = this.counters.get(key);
    if (!entry) return undefined;

    if (Date.now() >= entry.expiresAt) {
      this.counters.delete(key);
      return undefined;
    }
    return entry.value;
  }
}

const PERIOD_MS: Record<QuotaPeriod, number> = {
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
  month: 30 * 24 * 60 * 60_000,
};

const DEFAULT_WARN_FRACTION = 0.8;

/**
 * Counts usage against per-tenant ceilings.
 *
 * Distinct from `BudgetGuard`, which caps *spend* in dollars. This caps
 * *volume* — missions per month, connector calls per minute — which is what a
 * plan tier actually sells and what stops one tenant starving the others.
 *
 * Windows are fixed rather than rolling: everyone on a monthly plan resets on
 * the same boundary, which is what a customer reading their invoice expects.
 */
export class QuotaGuard {
  private readonly limits = new Map<string, QuotaLimit>();
  private readonly counters: CounterStore;

  constructor(limits: QuotaLimit[] = [], counters: CounterStore = new InMemoryCounterStore()) {
    this.counters = counters;
    for (const limit of limits) this.setLimit(limit);
  }

  setLimit(limit: QuotaLimit): void {
    if (!limit.id) {
      throw new ValidationError("limit.id", "must not be empty");
    }
    if (!limit.resource) {
      throw new ValidationError("limit.resource", "must not be empty");
    }
    if (!Number.isFinite(limit.limit) || limit.limit < 0) {
      throw new ValidationError("limit.limit", "must be a non-negative finite number");
    }
    if (!(limit.period in PERIOD_MS)) {
      throw new ValidationError("limit.period", `unknown period "${limit.period}"`);
    }

    this.limits.set(limit.id, limit);
  }

  removeLimit(limitId: string): boolean {
    return this.limits.delete(limitId);
  }

  listLimits(): QuotaLimit[] {
    return Array.from(this.limits.values());
  }

  /** Every limit governing this resource and scope. */
  applicable(resource: string, scope: BudgetScope): QuotaLimit[] {
    return Array.from(this.limits.values()).filter(
      (limit) => limit.resource === resource && this.covers(limit.scope, scope),
    );
  }

  /** Current usage without consuming any. */
  async status(resource: string, scope: BudgetScope): Promise<QuotaStatus[]> {
    return Promise.all(
      this.applicable(resource, scope).map(async (limit) => {
        const used = await this.counters.read(this.counterKey(limit, scope));
        return this.toStatus(limit, used);
      }),
    );
  }

  /**
   * Consumes `amount` and reports the outcome.
   *
   * Consumption happens before the check, so two concurrent callers cannot both
   * see room and both proceed. That means a rejected call still counts against
   * the window — the safe direction to be wrong for a rate limit.
   */
  async consume(
    resource: string,
    scope: BudgetScope,
    amount = 1,
  ): Promise<{ allowed: boolean; statuses: QuotaStatus[]; exceeded?: QuotaStatus }> {
    const limits = this.applicable(resource, scope);
    if (limits.length === 0) {
      return { allowed: true, statuses: [] };
    }

    const statuses = await Promise.all(
      limits.map(async (limit) => {
        const used = await this.counters.increment(
          this.counterKey(limit, scope),
          amount,
          PERIOD_MS[limit.period],
        );
        return this.toStatus(limit, used);
      }),
    );

    const exceeded = statuses.find((status) => status.exceeded);
    return { allowed: !exceeded, statuses, exceeded };
  }

  /** Statuses that have crossed their warn threshold but are not yet exceeded. */
  warnings(statuses: QuotaStatus[]): QuotaStatus[] {
    return statuses.filter((status) => {
      if (status.exceeded) return false;

      const limit = this.limits.get(status.limitId);
      const fraction = limit?.warnAtFraction ?? DEFAULT_WARN_FRACTION;
      return status.limit > 0 && status.used >= status.limit * fraction;
    });
  }

  private toStatus(limit: QuotaLimit, used: number): QuotaStatus {
    return {
      limitId: limit.id,
      resource: limit.resource,
      period: limit.period,
      used,
      limit: limit.limit,
      remaining: Math.max(0, limit.limit - used),
      exceeded: used > limit.limit,
      resetsAt: this.windowEnd(limit.period),
    };
  }

  /**
   * Counter key for one caller under one limit.
   *
   * Keyed on the *caller's* scope, not the limit's. A limit scoped `{}` applies
   * to every tenant, but each must still get its own counter — sharing one
   * would let a single org exhaust the allowance for all of them.
   *
   * The window is in the key, so a new period starts from zero with nothing
   * needing to sweep the old one.
   */
  private counterKey(limit: QuotaLimit, caller: BudgetScope): string {
    const window = Math.floor(Date.now() / PERIOD_MS[limit.period]);
    const scope = [caller.orgId ?? "*", caller.userId ?? "*", caller.agentId ?? "*"];

    return ["quota", limit.id, limit.resource, ...scope, window].join(":");
  }

  private windowEnd(period: QuotaPeriod): number {
    const size = PERIOD_MS[period];
    return (Math.floor(Date.now() / size) + 1) * size;
  }

  /** A limit field left undefined is a wildcard, as with budgets. */
  private covers(limitScope: BudgetScope, candidate: BudgetScope): boolean {
    if (limitScope.orgId !== undefined && limitScope.orgId !== candidate.orgId) return false;
    if (limitScope.userId !== undefined && limitScope.userId !== candidate.userId) return false;
    if (limitScope.agentId !== undefined && limitScope.agentId !== candidate.agentId) return false;
    return true;
  }
}
