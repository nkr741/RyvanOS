'use client';

import { useEffect, useState } from 'react';
import { DateRangePicker } from '@/components/ui/date-range-picker';

interface CompetitorData {
  marketShare: Record<string, { count: number; percentage: number }>;
  commissionComparison: Array<{
    platform: string;
    avgCommission: number;
    minCommission: number;
    maxCommission: number;
    merchantCount: number;
  }>;
  painPointsByPlatform: Record<string, Record<string, number>>;
  satisfactionScores: Record<string, number>;
  switchingIntent: Record<string, { wouldSwitch: number; total: number; percentage: number }>;
  areaBreakdown: Array<{
    area: string;
    dominant: string;
    swiggy: number;
    zomato: number;
    magicpin: number;
    ondc: number;
  }>;
}

const PLATFORM_COLORS: Record<string, string> = {
  Swiggy: '#f97316',
  Zomato: '#ef4444',
  Magicpin: '#a855f7',
  ONDC: '#3b82f6',
  None: '#a1a1aa',
};

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function commissionColor(val: number) {
  if (val > 20) return 'text-red-500';
  if (val >= 10) return 'text-amber-500';
  return 'text-emerald-500';
}

function satisfactionColor(score: number) {
  if (score >= 7) return '#22c55e';
  if (score >= 5) return '#f59e0b';
  return '#ef4444';
}

function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 ${className}`}>
      <div className="h-5 w-48 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-4" />
      <div className="space-y-3">
        <div className="h-8 w-full rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      </div>
    </div>
  );
}

export default function CompetitorsPage() {
  const [data, setData] = useState<CompetitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (dateRange.from) params.set('dateFrom', dateRange.from);
        if (dateRange.to) params.set('dateTo', dateRange.to);
        const qs = params.toString();
        const url = `/api/competitors/analysis${qs ? `?${qs}` : ''}`;
        const res = await fetch(url, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Failed to fetch competitor data');
        const json = await res.json();
        setData(json as CompetitorData);
      } catch {
        setError('Failed to load competitor intelligence');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [dateRange]);

  if (loading) {
    return (
      <div className="space-y-8 pb-12">
        <div>
          <div className="h-8 w-64 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-2" />
          <div className="h-4 w-80 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        </div>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const marketShareEntries = Object.entries(data.marketShare);
  const maxCommission = Math.max(...data.commissionComparison.map((c) => c.maxCommission), 1);
  const satisfactionEntries = Object.entries(data.satisfactionScores).sort(([, a], [, b]) => b - a);
  const sortedAreas = [...data.areaBreakdown].sort(
    (a, b) => (b.swiggy + b.zomato + b.magicpin + b.ondc) - (a.swiggy + a.zomato + a.magicpin + a.ondc)
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Competitor Intelligence
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Market dynamics and competitive positioning
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Market Share Overview */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Market Share Distribution
        </h2>
        {marketShareEntries.length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-sm">No market share data available for this period</p>
          </div>
        ) : (
          <>
            <div className="h-10 w-full rounded-lg overflow-hidden flex">
              {marketShareEntries.map(([platform, { percentage }]) => (
                <div
                  key={platform}
                  className="h-full transition-all duration-500 relative group"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: PLATFORM_COLORS[platform] || '#a1a1aa',
                  }}
                >
                  {percentage >= 8 && (
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">
                      {percentage}%
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mt-6">
              {marketShareEntries.map(([platform, { count, percentage }]) => (
                <div
                  key={platform}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[platform] || '#a1a1aa' }}
                    />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {platform}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {percentage}%
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                    {count} merchants
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: PLATFORM_COLORS[platform] || '#a1a1aa',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Commission Comparison Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Commission Comparison
        </h2>
        {data.commissionComparison.length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-sm">No commission data available for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Platform</th>
                  <th className="pb-3 pr-4">Avg Commission</th>
                  <th className="pb-3 pr-4">Min</th>
                  <th className="pb-3 pr-4">Max</th>
                  <th className="pb-3 pr-4">Merchants</th>
                  <th className="pb-3 w-40" />
                </tr>
              </thead>
              <tbody>
                {data.commissionComparison.map((row) => (
                  <tr
                    key={row.platform}
                    className="border-b border-zinc-200 dark:border-zinc-800 last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: PLATFORM_COLORS[row.platform] || '#a1a1aa' }}
                        />
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {row.platform}
                        </span>
                      </div>
                    </td>
                    <td className={`py-3 pr-4 text-sm font-semibold ${commissionColor(row.avgCommission)}`}>
                      {row.avgCommission.toFixed(1)}%
                    </td>
                    <td className={`py-3 pr-4 text-sm ${commissionColor(row.minCommission)}`}>
                      {row.minCommission}%
                    </td>
                    <td className={`py-3 pr-4 text-sm ${commissionColor(row.maxCommission)}`}>
                      {row.maxCommission}%
                    </td>
                    <td className="py-3 pr-4 text-sm text-zinc-600 dark:text-zinc-400">
                      {row.merchantCount}
                    </td>
                    <td className="py-3 w-40">
                      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(row.avgCommission / maxCommission) * 100}%`,
                            backgroundColor: PLATFORM_COLORS[row.platform] || '#a1a1aa',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pain Points by Platform */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Pain Points Correlated with Platform
        </h2>
        {Object.keys(data.painPointsByPlatform).length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-sm">No pain point data available for this period</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(data.painPointsByPlatform).map(([platform, painPoints]) => (
              <div
                key={platform}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden"
              >
                <div
                  className="px-4 py-3 font-medium text-sm text-zinc-900 dark:text-zinc-100"
                  style={{ borderLeft: `4px solid ${PLATFORM_COLORS[platform] || '#a1a1aa'}` }}
                >
                  {platform}
                </div>
                <div className="px-4 py-3 space-y-3">
                  {Object.entries(painPoints).map(([pain, value]) => (
                    <div key={pain}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">{pain}</span>
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {value}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${value}%`,
                            backgroundColor:
                              value >= 60
                                ? '#ef4444'
                                : value >= 40
                                  ? '#f97316'
                                  : value >= 20
                                    ? '#f59e0b'
                                    : '#a1a1aa',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Satisfaction + Switching Intent side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Platform Satisfaction Scores */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
            Satisfaction Scores (out of 10)
          </h2>
          {satisfactionEntries.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <p className="text-sm">No satisfaction data available for this period</p>
            </div>
          ) : (
            <div className="space-y-4">
              {satisfactionEntries.map(([platform, score]) => (
                <div key={platform} className="flex items-center gap-4">
                  <div className="w-24 shrink-0 flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[platform] || '#a1a1aa' }}
                    />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {platform}
                    </span>
                  </div>
                  <div className="flex-1 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 relative">
                    <div
                      className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                      style={{
                        width: `${(score / 10) * 100}%`,
                        backgroundColor: satisfactionColor(score),
                      }}
                    >
                      <span className="text-xs font-bold text-white">{score.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Switching Intent */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
            Switching Intent
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
            Percentage of merchants who would consider switching
          </p>
          {Object.keys(data.switchingIntent).length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <p className="text-sm">No switching intent data available for this period</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(data.switchingIntent).map(([platform, { wouldSwitch, total, percentage }]) => (
                <div key={platform} className="flex items-center gap-4">
                  <div className="w-24 shrink-0 flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PLATFORM_COLORS[platform] || '#a1a1aa' }}
                    />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {platform}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="h-6 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 relative">
                      <div
                        className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: PLATFORM_COLORS[platform] || '#a1a1aa',
                        }}
                      >
                        {percentage >= 15 && (
                          <span className="text-xs font-bold text-white">{percentage}%</span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 block">
                      {wouldSwitch} of {total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Area Breakdown */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Market Share by Area
        </h2>
        {sortedAreas.length === 0 ? (
          <div className="text-center py-12 text-zinc-400">
            <p className="text-sm">No area breakdown data available for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Area</th>
                  <th className="pb-3 pr-4">Dominant</th>
                  <th className="pb-3 pr-4 w-1/3">Distribution</th>
                  <th className="pb-3 pr-2 text-center">Swiggy</th>
                  <th className="pb-3 pr-2 text-center">Zomato</th>
                  <th className="pb-3 pr-2 text-center">Magicpin</th>
                  <th className="pb-3 text-center">ONDC</th>
                </tr>
              </thead>
              <tbody>
                {sortedAreas.map((row) => {
                  const total = row.swiggy + row.zomato + row.magicpin + row.ondc;
                  return (
                    <tr
                      key={row.area}
                      className="border-b border-zinc-200 dark:border-zinc-800 last:border-0"
                    >
                      <td className="py-3 pr-4 text-sm font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        {row.area}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: PLATFORM_COLORS[row.dominant] || '#a1a1aa' }}
                        >
                          {row.dominant}
                        </span>
                      </td>
                      <td className="py-3 pr-4 w-1/3">
                        <div className="h-3 w-full rounded-full overflow-hidden flex">
                          {total > 0 && (
                            <>
                              <div
                                className="h-full"
                                style={{
                                  width: `${(row.swiggy / total) * 100}%`,
                                  backgroundColor: PLATFORM_COLORS.Swiggy,
                                }}
                              />
                              <div
                                className="h-full"
                                style={{
                                  width: `${(row.zomato / total) * 100}%`,
                                  backgroundColor: PLATFORM_COLORS.Zomato,
                                }}
                              />
                              <div
                                className="h-full"
                                style={{
                                  width: `${(row.magicpin / total) * 100}%`,
                                  backgroundColor: PLATFORM_COLORS.Magicpin,
                                }}
                              />
                              <div
                                className="h-full"
                                style={{
                                  width: `${(row.ondc / total) * 100}%`,
                                  backgroundColor: PLATFORM_COLORS.ONDC,
                                }}
                              />
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-2 text-xs text-center text-zinc-600 dark:text-zinc-400">
                        {row.swiggy}
                      </td>
                      <td className="py-3 pr-2 text-xs text-center text-zinc-600 dark:text-zinc-400">
                        {row.zomato}
                      </td>
                      <td className="py-3 pr-2 text-xs text-center text-zinc-600 dark:text-zinc-400">
                        {row.magicpin}
                      </td>
                      <td className="py-3 text-xs text-center text-zinc-600 dark:text-zinc-400">
                        {row.ondc}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
