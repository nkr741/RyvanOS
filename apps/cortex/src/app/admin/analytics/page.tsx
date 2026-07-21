'use client';

import { useEffect, useState } from 'react';
import { Lightbulb, Brain, TrendingUp, BarChart3, PieChart, Star, Zap } from 'lucide-react';
import { DateRangePicker } from '@/components/ui/date-range-picker';

interface AnalyticsResponse {
  painPointAggregation: Array<{
    painPoint: string;
    totalResponses: number;
    averageRating: number;
  }>;
  competitorMarketShare: Array<{ platform: string; count: number; percentage: number }>;
  averageCommissionByPlatform: Array<{
    platform: string;
    averageCommission: number;
    respondents: number;
  }>;
  featureVotingResults: Array<{ feature: string; averageImportance: number; totalVotes: number }>;
  interestDistribution: Array<{ level: string; count: number; percentage: number }>;
  dailySurveyTrend: Array<{ date: string; count: number }>;
  totalSurveysAnalyzed: number;
}

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700 ${className}`}
    />
  );
}

function CardSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <Skeleton className="mb-4 h-6 w-48" />
      <Skeleton className={`w-full ${height}`} />
    </div>
  );
}

function SurveyTrendsChart({ data }: { data: AnalyticsResponse['dailySurveyTrend'] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
        No trend data available yet
      </p>
    );
  }

  const padding = { top: 20, right: 20, bottom: 60, left: 50 };
  const chartWidth = 900;
  const chartHeight = 300;
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const yMax = Math.ceil(maxCount / 5) * 5 || 5;

  const points = data.map((d, i) => ({
    x: padding.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2),
    y: padding.top + innerH - (d.count / yMax) * innerH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + innerH} L${points[0].x},${padding.top + innerH} Z`;

  const gridLines = Array.from({ length: 6 }, (_, i) => {
    const val = (yMax / 5) * i;
    const y = padding.top + innerH - (val / yMax) * innerH;
    return { y, val: Math.round(val) };
  });

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      className="overflow-visible"
    >
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(59,130,246)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="rgb(59,130,246)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {gridLines.map((g) => (
        <g key={g.val}>
          <line
            x1={padding.left}
            y1={g.y}
            x2={padding.left + innerW}
            y2={g.y}
            stroke="currentColor"
            className="text-zinc-200 dark:text-zinc-700"
            strokeWidth="1"
          />
          <text
            x={padding.left - 8}
            y={g.y + 4}
            textAnchor="end"
            className="fill-zinc-400 dark:fill-zinc-500"
            fontSize="11"
          >
            {g.val}
          </text>
        </g>
      ))}

      <path
        d={areaPath}
        fill="url(#areaGrad)"
        opacity={mounted ? 1 : 0}
        style={{ transition: 'opacity 0.8s ease' }}
      />

      <path
        d={linePath}
        fill="none"
        stroke="rgb(59,130,246)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={mounted ? '0' : '2000'}
        strokeDashoffset={mounted ? '0' : '2000'}
        style={{ transition: 'stroke-dashoffset 1.2s ease' }}
      />

      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill="rgb(59,130,246)"
          stroke="white"
          strokeWidth="1.5"
          opacity={mounted ? 1 : 0}
          style={{ transition: `opacity 0.5s ease ${i * 30}ms` }}
        >
          <title>{`${p.date}: ${p.count} surveys`}</title>
        </circle>
      ))}

      {points.map(
        (p, i) =>
          i % 5 === 0 && (
            <text
              key={`label-${i}`}
              x={p.x}
              y={padding.top + innerH + 16}
              textAnchor="end"
              className="fill-zinc-400 dark:fill-zinc-500"
              fontSize="10"
              transform={`rotate(-45, ${p.x}, ${padding.top + innerH + 16})`}
            >
              {p.date.slice(5)}
            </text>
          ),
      )}
    </svg>
  );
}

function PainPointSection({
  items,
}: {
  items: AnalyticsResponse['painPointAggregation'];
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(t);
  }, []);

  const sorted = [...items].sort((a, b) => b.averageRating - a.averageRating);

  const painColors = [
    'bg-red-500',
    'bg-red-400',
    'bg-orange-500',
    'bg-orange-400',
    'bg-amber-500',
    'bg-yellow-400',
  ];

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
        No pain point data available
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {sorted.map((item, idx) => {
        const pct = (item.averageRating / 5) * 100;
        return (
          <div key={item.painPoint} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {item.painPoint}
                <span className="ml-2 text-xs text-zinc-400">
                  ({item.totalResponses} responses)
                </span>
              </span>
              <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                {Array.from({ length: 5 }, (_, s) => (
                  <Star
                    key={s}
                    className={`h-3.5 w-3.5 ${
                      s < Math.round(item.averageRating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'fill-none text-zinc-300 dark:text-zinc-600'
                    }`}
                  />
                ))}
                <span className="ml-1 tabular-nums">{item.averageRating.toFixed(1)}</span>
              </span>
            </div>
            <div className="relative h-6 w-full overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`h-6 rounded-md transition-all duration-700 ease-out ${painColors[idx] || 'bg-yellow-400'}`}
                style={{ width: mounted ? `${pct}%` : '0%' }}
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                {item.averageRating.toFixed(1)}/5
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommissionChart({
  data,
}: {
  data: AnalyticsResponse['averageCommissionByPlatform'];
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 300);
    return () => clearTimeout(t);
  }, []);

  const maxVal = Math.max(...data.map((d) => d.averageCommission), 1);

  const colorMap: Record<string, string> = {
    Swiggy: 'bg-orange-500',
    Zomato: 'bg-red-500',
    Magicpin: 'bg-purple-500',
    ONDC: 'bg-blue-500',
    Direct: 'bg-emerald-500',
  };

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
        No commission data available
      </p>
    );
  }

  return (
    <div className="flex items-end justify-around gap-3" style={{ height: 220 }}>
      {data.map((item) => {
        const heightPct = maxVal > 0 ? (item.averageCommission / maxVal) * 100 : 0;
        return (
          <div key={item.platform} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
              {item.averageCommission.toFixed(1)}%
            </span>
            <div className="relative w-full max-w-[56px]" style={{ height: 160 }}>
              <div
                className={`absolute bottom-0 w-full rounded-t-md transition-all duration-700 ease-out ${colorMap[item.platform] || 'bg-zinc-400'}`}
                style={{ height: mounted ? `${heightPct}%` : '0%' }}
              />
            </div>
            <span className="mt-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {item.platform}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data }: { data: AnalyticsResponse['interestDistribution'] }) {
  const total = data.reduce((s, i) => s + i.count, 0);

  const colorMap: Record<string, string> = {
    hot: 'rgb(16,185,129)',
    warm: 'rgb(59,130,246)',
    cold: 'rgb(239,68,68)',
    interested: 'rgb(16,185,129)',
    'follow-up': 'rgb(59,130,246)',
    'not interested': 'rgb(239,68,68)',
    unknown: 'rgb(161,161,170)',
  };

  const dotColorMap: Record<string, string> = {
    hot: 'bg-emerald-500',
    warm: 'bg-blue-500',
    cold: 'bg-red-500',
    interested: 'bg-emerald-500',
    'follow-up': 'bg-blue-500',
    'not interested': 'bg-red-500',
    unknown: 'bg-zinc-400',
  };

  if (total === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
        No interest data available
      </p>
    );
  }

  let cumulative = 0;
  const stops: string[] = [];
  data.forEach((item) => {
    const start = cumulative;
    const end = cumulative + (item.count / total) * 100;
    stops.push(`${colorMap[item.level.toLowerCase()] || '#888'} ${start}% ${end}%`);
    cumulative = end;
  });

  const gradient = `conic-gradient(${stops.join(', ')})`;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-48 w-48">
        <div
          className="h-full w-full rounded-full"
          style={{ background: gradient }}
        />
        <div className="absolute inset-0 m-auto flex h-28 w-28 items-center justify-center rounded-full bg-white dark:bg-zinc-900">
          <div className="text-center">
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {total}
            </div>
            <div className="text-[11px] text-zinc-500">Total</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {data.map((item) => (
          <div key={item.level} className="flex items-center gap-2 text-sm">
            <span
              className={`inline-block h-3 w-3 rounded-full ${dotColorMap[item.level.toLowerCase()] || 'bg-zinc-400'}`}
            />
            <span className="text-zinc-600 dark:text-zinc-400 capitalize">{item.level}</span>
            <span className="ml-auto font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
              {total > 0 ? Math.round((item.count / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureDemand({
  data,
}: {
  data: AnalyticsResponse['featureVotingResults'];
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 400);
    return () => clearTimeout(t);
  }, []);

  if (data.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
        No feature voting data available
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((item, idx) => {
        const pct = (item.averageImportance / 5) * 100;
        return (
          <div key={item.feature} className="flex items-center gap-4">
            <span className="w-44 shrink-0 truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
              {idx + 1}. {item.feature}
            </span>
            <div className="relative flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800 h-5">
              <div
                className="h-5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700 ease-out"
                style={{ width: mounted ? `${pct}%` : '0%' }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold text-white mix-blend-difference">
                {item.averageImportance.toFixed(1)} / 5
              </span>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              {item.totalVotes} votes
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AIRecommendations({ data }: { data: AnalyticsResponse | null }) {
  if (!data) return null;

  const recommendations: string[] = [];

  // Generate recommendations from real data
  const topPain = data.painPointAggregation
    .sort((a, b) => b.averageRating - a.averageRating)[0];
  if (topPain) {
    recommendations.push(
      `Focus on "${topPain.painPoint}" — rated ${topPain.averageRating.toFixed(1)}/5 severity across ${topPain.totalResponses} vendors`
    );
  }

  const topCompetitor = data.competitorMarketShare[0];
  if (topCompetitor) {
    recommendations.push(
      `Target ${topCompetitor.platform}-dominant areas for conversion — ${topCompetitor.percentage}% market share with ${topCompetitor.count} vendors`
    );
  }

  const topFeature = data.featureVotingResults[0];
  if (topFeature) {
    recommendations.push(
      `Prioritize "${topFeature.feature}" in MVP — highest demand score (${topFeature.averageImportance.toFixed(1)}/5) from ${topFeature.totalVotes} votes`
    );
  }

  const followUpInterest = data.interestDistribution.find(
    (i) => i.level.toLowerCase() === 'warm' || i.level.toLowerCase() === 'follow-up'
  );
  if (followUpInterest) {
    recommendations.push(
      `Schedule follow-ups for ${followUpInterest.count} "${followUpInterest.level}" prospects in next sprint`
    );
  }

  const highCommission = data.averageCommissionByPlatform
    .sort((a, b) => b.averageCommission - a.averageCommission)[0];
  if (highCommission) {
    recommendations.push(
      `${highCommission.platform} has highest avg commission at ${highCommission.averageCommission.toFixed(1)}% — highlight this in competitive pitch`
    );
  }

  if (recommendations.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-8">
        Not enough data to generate recommendations. Keep surveying!
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/50"
        >
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {rec}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams();
        if (dateRange.from) params.set('dateFrom', dateRange.from);
        if (dateRange.to) params.set('dateTo', dateRange.to);
        const qs = params.toString();
        const res = await fetch(`/api/dashboard/analytics${qs ? `?${qs}` : ''}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Failed to fetch analytics');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError('Failed to load analytics data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [dateRange]);

  if (loading) {
    return (
      <div className="space-y-8 pb-12">
        <div>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <CardSkeleton height="h-72" />
        <CardSkeleton height="h-56" />
        <div className="grid gap-6 lg:grid-cols-2">
          <CardSkeleton height="h-64" />
          <CardSkeleton height="h-64" />
        </div>
        <CardSkeleton height="h-56" />
        <CardSkeleton height="h-48" />
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

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Deep Analytics
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Comprehensive market intelligence from {data.totalSurveysAnalyzed} surveys
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          Survey Trends &mdash; Last 30 Days
        </h2>
        <div className="overflow-x-auto">
          <SurveyTrendsChart data={data.dailySurveyTrend} />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          <Zap className="h-5 w-5 text-red-500" />
          Pain Point Analysis
        </h2>
        <PainPointSection items={data.painPointAggregation} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <BarChart3 className="h-5 w-5 text-indigo-500" />
            Average Commission by Platform
          </h2>
          <CommissionChart data={data.averageCommissionByPlatform} />
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <PieChart className="h-5 w-5 text-emerald-500" />
            Interest Distribution
          </h2>
          <DonutChart data={data.interestDistribution} />
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          <Star className="h-5 w-5 text-amber-500" />
          Feature Demand Rankings
        </h2>
        <FeatureDemand data={data.featureVotingResults} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          <Brain className="h-5 w-5 text-purple-500" />
          AI Recommendations
        </h2>
        <AIRecommendations data={data} />
      </section>
    </div>
  );
}
