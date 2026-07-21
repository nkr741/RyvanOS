import type { ModelProvider, TokenUsage } from "./types.js";

export interface UsageRecord extends TokenUsage {
  model: string;
  provider: ModelProvider;
  tenantId?: string;
  userId?: string;
  timestamp: number;
}

export interface UsageFilter {
  tenantId?: string;
  userId?: string;
  model?: string;
  since?: number;
}

export interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, { calls: number; tokens: number; cost: number }>;
}

const DEFAULT_MAX_RECORDS = 10000;

export class CostTracker {
  private readonly records: UsageRecord[] = [];
  private readonly maxRecords: number;

  constructor(maxRecords = DEFAULT_MAX_RECORDS) {
    this.maxRecords = maxRecords;
  }

  record(
    usage: TokenUsage & {
      model: string;
      provider: ModelProvider;
      tenantId?: string;
      userId?: string;
    },
  ): void {
    if (!usage.model) return;
    if (usage.totalTokens < 0 || usage.estimatedCost < 0) return;
    if (!Number.isFinite(usage.totalTokens) || !Number.isFinite(usage.estimatedCost)) return;

    this.records.push({
      ...usage,
      timestamp: Date.now(),
    });

    if (this.records.length > this.maxRecords) {
      this.records.splice(0, this.records.length - this.maxRecords);
    }
  }

  getTotalCost(filter?: UsageFilter): number {
    return this.filterRecords(filter).reduce((sum, r) => sum + r.estimatedCost, 0);
  }

  getUsageSummary(filter?: UsageFilter): UsageSummary {
    const filtered = this.filterRecords(filter);

    const byModel: Record<string, { calls: number; tokens: number; cost: number }> = {};

    let totalCalls = 0;
    let totalTokens = 0;
    let totalCost = 0;

    for (const record of filtered) {
      totalCalls++;
      totalTokens += record.totalTokens;
      totalCost += record.estimatedCost;

      const entry = byModel[record.model] ?? { calls: 0, tokens: 0, cost: 0 };
      entry.calls++;
      entry.tokens += record.totalTokens;
      entry.cost += record.estimatedCost;
      byModel[record.model] = entry;
    }

    return { totalCalls, totalTokens, totalCost, byModel };
  }

  private filterRecords(filter?: UsageFilter): UsageRecord[] {
    if (!filter) {
      return this.records;
    }

    return this.records.filter((r) => {
      if (filter.tenantId && r.tenantId !== filter.tenantId) return false;
      if (filter.userId && r.userId !== filter.userId) return false;
      if (filter.model && r.model !== filter.model) return false;
      if (filter.since && r.timestamp < filter.since) return false;
      return true;
    });
  }
}
