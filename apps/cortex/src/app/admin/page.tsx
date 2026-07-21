'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IndianRupee, TrendingUp, AlertTriangle, GitBranch, Sparkles,
  AlertCircle, MapPin, Phone, FileText, CalendarClock, Trophy,
  CheckCircle2, Brain, ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ForecastBreakdown {
  stage: string; label: string; count: number; revenue: number; conversionRate: number;
}

interface FounderData {
  pipelineValue: number;
  forecast: { expectedRevenue: number; confidence: number; breakdown: ForecastBreakdown[] };
  actions: Array<{
    type: 'visit' | 'call' | 'proposal' | 'follow_up' | 'escalate' | 'celebrate';
    priority: 'critical' | 'high' | 'medium' | 'low';
    title: string; description: string; merchantId: string; merchantName: string; score: number;
  }>;
  territories: Array<{
    area: string; totalMerchants: number; activePipeline: number; interested: number;
    needFollowUp: number; atRisk: number; avgCommission: number;
    totalRevenuePotential: number; topCategory: string; recommendation: string; score: number;
  }>;
  stageCounts: Record<string, number>;
  atRiskMerchants: Array<{
    id: string; businessName: string; ownerName: string; stage: string;
    daysSinceActivity: number; daysInStage: number; healthScore: number; recommendation: string;
  }>;
  highPriority: number; todayFollowUps: number; negotiations: number;
  onboardings: number; totalMerchants: number; activePipeline: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<string, string> = {
  new: 'Lead', qualified: 'Qualified', interested: 'Interested',
  negotiation: 'Negotiation', onboarded: 'Onboarded', active_merchant: 'Active Merchant',
};

const STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-500', qualified: 'bg-indigo-500', interested: 'bg-amber-500',
  negotiation: 'bg-purple-500', onboarded: 'bg-emerald-500', active_merchant: 'bg-green-500',
};

const STAGE_BADGE: Record<string, string> = {
  new: 'bg-blue-500/10 text-blue-600', qualified: 'bg-indigo-500/10 text-indigo-600',
  interested: 'bg-amber-500/10 text-amber-600', negotiation: 'bg-purple-500/10 text-purple-600',
  onboarded: 'bg-emerald-500/10 text-emerald-600', active_merchant: 'bg-green-500/10 text-green-600',
};

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-600 border-red-500/20',
  high: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  medium: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  low: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20',
};

const ACTION_ICONS: Record<string, typeof MapPin> = {
  visit: MapPin, call: Phone, proposal: FileText,
  follow_up: CalendarClock, escalate: AlertTriangle, celebrate: Trophy,
};

const STAGE_ORDER = ['new', 'qualified', 'interested', 'negotiation', 'onboarded', 'active_merchant'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function formatLargeINR(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Style shorthand helpers
const card = 'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] shadow-[var(--shadow-sm)]';
const hoverRow = 'w-full text-left rounded-[var(--radius)] p-[var(--space-3)] transition-[background-color] duration-[var(--transition-fast)] hover:bg-[var(--muted)]';
const fg = 'text-[var(--foreground)]';
const muted = 'text-[var(--muted-foreground)]';

// ---------------------------------------------------------------------------
// Skeleton Components
// ---------------------------------------------------------------------------

function Sk({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-[var(--radius)] bg-[var(--muted)]', className)} />;
}

function SkeletonMetrics() {
  return (
    <div className="grid gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={cn(card, 'p-[var(--space-6)]')}>
          <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-4)]">
            <Sk className="h-10 w-10" />
            <Sk className="h-4 w-24" />
          </div>
          <Sk className="h-8 w-28 mb-1" />
          <Sk className="h-3 w-16 mt-[var(--space-2)]" />
        </div>
      ))}
    </div>
  );
}

function SkeletonCard({ lines = 5 }: { lines?: number }) {
  return (
    <div className={cn(card, 'p-[var(--space-6)]')}>
      <div className="flex items-center gap-[var(--space-2)] mb-[var(--space-6)]">
        <Sk className="h-5 w-5 rounded-[var(--radius-sm)]" />
        <Sk className="h-5 w-36" />
      </div>
      <div className="space-y-[var(--space-4)]">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-[var(--space-3)]">
            <Sk className="h-10 w-10" />
            <div className="flex-1 space-y-[var(--space-2)]">
              <Sk className="h-4 w-3/4" />
              <Sk className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Card
// ---------------------------------------------------------------------------

function SectionCard({
  title, icon: Icon, children, className,
}: {
  title: string; icon: typeof Sparkles; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn(card, className)}>
      <div className="px-[var(--space-6)] pt-[var(--space-6)] pb-[var(--space-2)] flex items-center gap-[var(--space-2)]">
        <Icon className={cn('h-[18px] w-[18px]', muted)} strokeWidth={1.8} />
        <h2 className={cn('font-semibold', fg)} style={{ fontSize: 'var(--text-base)' }}>{title}</h2>
      </div>
      <div className="px-[var(--space-6)] pb-[var(--space-6)] pt-[var(--space-3)]">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

function MetricCard({
  label, value, icon: Icon, accentFrom, accentTo, iconBg, iconColor, badge,
}: {
  label: string; value: string; icon: typeof IndianRupee;
  accentFrom: string; accentTo: string; iconBg: string; iconColor: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className={cn(card, `relative overflow-hidden p-[var(--space-6)] bg-gradient-to-br ${accentFrom} ${accentTo}`)}>
      <div className="flex items-center justify-between mb-[var(--space-4)]">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-[var(--radius)]', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} strokeWidth={1.8} />
        </div>
        {badge}
      </div>
      <p className={cn('font-bold tabular-nums', fg)} style={{ fontSize: 'var(--text-2xl)' }}>{value}</p>
      <p className={muted} style={{ fontSize: 'var(--text-sm)' }}>{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-[var(--space-8)] text-center">
      <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-[var(--space-3)]" strokeWidth={1.5} />
      <p className={cn('font-medium', fg)} style={{ fontSize: 'var(--text-sm)' }}>All clear</p>
      <p className={muted} style={{ fontSize: 'var(--text-xs)' }}>{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FounderData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/ai?type=founder', { headers: getAuthHeaders() });
        if (!res.ok) { setError('Failed to load founder intelligence'); return; }
        setData(await res.json());
      } catch {
        setError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalStageCount = data ? Object.values(data.stageCounts).reduce((a, b) => a + b, 0) : 0;
  const maxStageCount = data ? Math.max(...Object.values(data.stageCounts), 1) : 1;
  const topTerritories = (data?.territories ?? []).sort((a, b) => b.score - a.score).slice(0, 5);

  return (
    <div className="space-y-[var(--space-8)] pb-[var(--space-12)]">

      {/* ---- Header ---- */}
      <div>
        <p className={muted} style={{ fontSize: 'var(--text-sm)' }}>
          {getGreeting()} &middot; {format(new Date(), 'EEEE, d MMMM yyyy')}
        </p>
        <div className="flex items-center gap-[var(--space-2)] mt-[var(--space-1)]">
          <Brain className="h-6 w-6 text-[var(--primary)]" strokeWidth={1.6} />
          <h1 className={cn('font-bold', fg)} style={{ fontSize: 'var(--text-2xl)' }}>
            Cortex Intelligence
          </h1>
        </div>
        <p className={muted} style={{ fontSize: 'var(--text-sm)' }}>
          Here&apos;s what needs your attention today
        </p>
      </div>

      {/* ---- Error ---- */}
      {error && (
        <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-[var(--space-4)] text-red-600"
          style={{ fontSize: 'var(--text-sm)' }}>
          {error}
        </div>
      )}

      {/* ================================================================= */}
      {/* Row 1 -- Key Metrics                                               */}
      {/* ================================================================= */}
      {loading ? <SkeletonMetrics /> : data ? (
        <div className="grid gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Revenue Pipeline" value={formatLargeINR(data.pipelineValue)}
            icon={IndianRupee} accentFrom="from-blue-500/5" accentTo="to-blue-500/0"
            iconBg="bg-blue-500/10" iconColor="text-blue-500" />
          <MetricCard label="Expected Revenue" value={formatLargeINR(data.forecast.expectedRevenue)}
            icon={TrendingUp} accentFrom="from-emerald-500/5" accentTo="to-emerald-500/0"
            iconBg="bg-emerald-500/10" iconColor="text-emerald-500"
            badge={
              <span className="inline-flex items-center rounded-[var(--radius-full)] bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 tabular-nums"
                style={{ fontSize: 'var(--text-xs)' }}>
                {data.forecast.confidence}% conf
              </span>
            } />
          <MetricCard label="High Priority" value={String(data.highPriority)}
            icon={AlertTriangle}
            accentFrom={data.highPriority > 5 ? 'from-red-500/5' : 'from-amber-500/5'}
            accentTo={data.highPriority > 5 ? 'to-red-500/0' : 'to-amber-500/0'}
            iconBg={data.highPriority > 5 ? 'bg-red-500/10' : 'bg-amber-500/10'}
            iconColor={data.highPriority > 5 ? 'text-red-500' : 'text-amber-500'} />
          <MetricCard label="Active Pipeline" value={String(data.activePipeline)}
            icon={GitBranch} accentFrom="from-purple-500/5" accentTo="to-purple-500/0"
            iconBg="bg-purple-500/10" iconColor="text-purple-500" />
        </div>
      ) : null}

      {/* ================================================================= */}
      {/* Row 2 -- Actions + Risk Alerts                                     */}
      {/* ================================================================= */}
      {loading ? (
        <div className="grid gap-[var(--space-4)] lg:grid-cols-5">
          <div className="lg:col-span-3"><SkeletonCard lines={6} /></div>
          <div className="lg:col-span-2"><SkeletonCard lines={4} /></div>
        </div>
      ) : data ? (
        <div className="grid gap-[var(--space-4)] lg:grid-cols-5">

          {/* -- Next Best Actions -- */}
          <div className="lg:col-span-3">
            <SectionCard title="Next Best Actions" icon={Sparkles}>
              {data.actions.length === 0 ? <EmptyState text="No actions pending right now" /> : (
                <div className="space-y-[var(--space-1)]">
                  {data.actions.slice(0, 8).map((action, idx) => {
                    const ActionIcon = ACTION_ICONS[action.type] || Sparkles;
                    return (
                      <button key={`${action.merchantId}-${idx}`}
                        onClick={() => router.push(`/admin/surveys/vendor/${action.merchantId}`)}
                        className={hoverRow}>
                        <div className="flex items-start gap-[var(--space-3)]">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--muted)]">
                            <ActionIcon className={cn('h-4 w-4', muted)} strokeWidth={1.8} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-[var(--space-2)] mb-0.5">
                              <span className={cn('inline-flex items-center rounded-[var(--radius-full)] border px-1.5 py-px font-medium capitalize',
                                PRIORITY_STYLES[action.priority] ?? PRIORITY_STYLES.low)}
                                style={{ fontSize: '10px' }}>
                                {action.priority}
                              </span>
                              <span className={cn('truncate', muted)} style={{ fontSize: 'var(--text-xs)' }}>
                                {action.merchantName}
                              </span>
                            </div>
                            <p className={cn('font-medium truncate', fg)} style={{ fontSize: 'var(--text-sm)' }}>
                              {action.title}
                            </p>
                            <p className={cn('line-clamp-1 mt-0.5', muted)} style={{ fontSize: 'var(--text-xs)' }}>
                              {action.description}
                            </p>
                          </div>
                          <ChevronRight className={cn('h-4 w-4 shrink-0 mt-2', muted)} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>

          {/* -- Risk Alerts -- */}
          <div className="lg:col-span-2">
            <SectionCard title="Deals at Risk" icon={AlertCircle}>
              {data.atRiskMerchants.length === 0 ? <EmptyState text="No deals at risk right now" /> : (
                <div className="space-y-[var(--space-1)]">
                  {data.atRiskMerchants.map((m) => (
                    <button key={m.id}
                      onClick={() => router.push(`/admin/surveys/vendor/${m.id}`)}
                      className={hoverRow}>
                      <div className="flex items-center justify-between mb-1">
                        <p className={cn('font-medium truncate', fg)} style={{ fontSize: 'var(--text-sm)' }}>
                          {m.businessName}
                        </p>
                        <span className={cn('inline-flex items-center rounded-[var(--radius-full)] px-2 py-px font-medium shrink-0 ml-[var(--space-2)]',
                          STAGE_BADGE[m.stage] ?? 'bg-zinc-500/10 text-zinc-500')}
                          style={{ fontSize: '10px' }}>
                          {STAGE_LABELS[m.stage] ?? m.stage}
                        </span>
                      </div>
                      <div className="flex items-center gap-[var(--space-3)]">
                        <span className="text-red-500 font-medium" style={{ fontSize: 'var(--text-xs)' }}>
                          No activity for {m.daysSinceActivity}d
                        </span>
                        <span className={muted} style={{ fontSize: 'var(--text-xs)' }}>
                          {m.daysInStage}d in stage
                        </span>
                      </div>
                      <p className={cn('mt-1 line-clamp-1', muted)} style={{ fontSize: 'var(--text-xs)' }}>
                        {m.recommendation}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}

      {/* ================================================================= */}
      {/* Row 3 -- Territory Intelligence + Pipeline Funnel                  */}
      {/* ================================================================= */}
      {loading ? (
        <div className="grid gap-[var(--space-4)] lg:grid-cols-5">
          <div className="lg:col-span-3"><SkeletonCard lines={5} /></div>
          <div className="lg:col-span-2"><SkeletonCard lines={6} /></div>
        </div>
      ) : data ? (
        <div className="grid gap-[var(--space-4)] lg:grid-cols-5">

          {/* -- Territory Intelligence -- */}
          <div className="lg:col-span-3">
            <SectionCard title="Territory Intelligence" icon={MapPin}>
              {topTerritories.length === 0 ? (
                <p className={cn('py-[var(--space-6)] text-center', muted)} style={{ fontSize: 'var(--text-sm)' }}>
                  No territory data available
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        {['Area', 'Merchants', 'Interested', 'Avg Comm.', 'Potential', 'Rec.'].map((h) => (
                          <th key={h} className={cn('py-[var(--space-2)] font-semibold uppercase tracking-wider whitespace-nowrap', muted,
                            h === 'Area' ? 'text-left pr-[var(--space-4)]' : 'text-right px-[var(--space-2)]')}
                            style={{ fontSize: '10px' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topTerritories.map((t, idx) => (
                        <tr key={t.area} className={cn('border-b border-[var(--border)] last:border-0', idx === 0 && 'bg-emerald-500/[0.03]')}>
                          <td className="py-[var(--space-3)] pr-[var(--space-4)]" style={{ fontSize: 'var(--text-sm)' }}>
                            <span className={cn('font-medium', fg)}>{t.area}</span>
                          </td>
                          <td className={cn('py-[var(--space-3)] px-[var(--space-2)] text-right tabular-nums', fg)}
                            style={{ fontSize: 'var(--text-sm)' }}>{t.totalMerchants}</td>
                          <td className="py-[var(--space-3)] px-[var(--space-2)] text-right tabular-nums text-emerald-600"
                            style={{ fontSize: 'var(--text-sm)' }}>{t.interested}</td>
                          <td className={cn('py-[var(--space-3)] px-[var(--space-2)] text-right tabular-nums', fg)}
                            style={{ fontSize: 'var(--text-sm)' }}>{t.avgCommission.toFixed(1)}%</td>
                          <td className={cn('py-[var(--space-3)] px-[var(--space-2)] text-right tabular-nums font-medium', fg)}
                            style={{ fontSize: 'var(--text-sm)' }}>{formatLargeINR(t.totalRevenuePotential)}</td>
                          <td className={cn('py-[var(--space-3)] pl-[var(--space-2)] text-right max-w-[140px] truncate', muted)}
                            style={{ fontSize: 'var(--text-xs)' }}>{t.recommendation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>

          {/* -- Pipeline Funnel -- */}
          <div className="lg:col-span-2">
            <SectionCard title="Pipeline Stages" icon={GitBranch}>
              {totalStageCount === 0 ? (
                <p className={cn('py-[var(--space-6)] text-center', muted)} style={{ fontSize: 'var(--text-sm)' }}>
                  No pipeline data
                </p>
              ) : (
                <div className="space-y-[var(--space-3)]">
                  {STAGE_ORDER.map((stage) => {
                    const count = data.stageCounts[stage] ?? 0;
                    const pct = (count / maxStageCount) * 100;
                    return (
                      <div key={stage}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn('font-medium', fg)} style={{ fontSize: 'var(--text-sm)' }}>
                            {STAGE_LABELS[stage] ?? stage}
                          </span>
                          <span className={cn('tabular-nums', muted)} style={{ fontSize: 'var(--text-sm)' }}>{count}</span>
                        </div>
                        <div className="h-6 w-full rounded-[var(--radius-sm)] bg-[var(--muted)] overflow-hidden">
                          <div className={cn('h-6 rounded-[var(--radius-sm)] transition-all duration-700', STAGE_COLORS[stage] ?? 'bg-zinc-400')}
                            style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-[var(--space-2)] border-t border-[var(--border)]">
                    <span className={cn('font-semibold', fg)} style={{ fontSize: 'var(--text-sm)' }}>Total</span>
                    <span className={cn('font-semibold tabular-nums', fg)} style={{ fontSize: 'var(--text-sm)' }}>{totalStageCount}</span>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      ) : null}

      {/* ================================================================= */}
      {/* Row 4 -- Revenue Forecast                                          */}
      {/* ================================================================= */}
      {loading ? <SkeletonCard lines={5} /> : data && data.forecast.breakdown.length > 0 ? (
        <SectionCard title="Revenue Forecast" icon={TrendingUp}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  {['Stage', 'Merchants', 'Expected Revenue', 'Conversion'].map((h, i) => (
                    <th key={h} className={cn('py-[var(--space-2)] font-semibold uppercase tracking-wider whitespace-nowrap', muted,
                      i === 0 ? 'text-left pr-[var(--space-4)]' : 'text-right px-[var(--space-2)]')}
                      style={{ fontSize: '10px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.forecast.breakdown.map((row) => {
                  const maxRev = Math.max(...data.forecast.breakdown.map((b) => b.revenue), 1);
                  const barW = (row.revenue / maxRev) * 100;
                  const barColor = STAGE_COLORS[row.stage] ?? 'bg-zinc-400';
                  return (
                    <tr key={row.stage} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-[var(--space-3)] pr-[var(--space-4)]">
                        <div className="flex items-center gap-[var(--space-2)]">
                          <div className={cn('h-2 w-2 rounded-[var(--radius-full)] shrink-0', barColor)} />
                          <span className={cn('font-medium', fg)} style={{ fontSize: 'var(--text-sm)' }}>{row.label}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full max-w-[200px] rounded-[var(--radius-full)] bg-[var(--muted)] overflow-hidden">
                          <div className={cn('h-1.5 rounded-[var(--radius-full)] transition-all duration-700', barColor)}
                            style={{ width: `${barW}%` }} />
                        </div>
                      </td>
                      <td className={cn('py-[var(--space-3)] px-[var(--space-2)] text-right tabular-nums', fg)}
                        style={{ fontSize: 'var(--text-sm)' }}>{row.count}</td>
                      <td className={cn('py-[var(--space-3)] px-[var(--space-2)] text-right tabular-nums font-medium', fg)}
                        style={{ fontSize: 'var(--text-sm)' }}>{formatLargeINR(row.revenue)}</td>
                      <td className={cn('py-[var(--space-3)] pl-[var(--space-2)] text-right tabular-nums', muted)}
                        style={{ fontSize: 'var(--text-sm)' }}>{row.conversionRate}%</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)]">
                  <td className={cn('py-[var(--space-3)] pr-[var(--space-4)] font-semibold', fg)}
                    style={{ fontSize: 'var(--text-sm)' }}>Total Expected</td>
                  <td className={cn('py-[var(--space-3)] px-[var(--space-2)] text-right tabular-nums font-semibold', fg)}
                    style={{ fontSize: 'var(--text-sm)' }}>
                    {data.forecast.breakdown.reduce((s, r) => s + r.count, 0)}
                  </td>
                  <td className={cn('py-[var(--space-3)] px-[var(--space-2)] text-right tabular-nums font-bold', fg)}
                    style={{ fontSize: 'var(--text-sm)' }}>
                    {formatLargeINR(data.forecast.expectedRevenue)}
                  </td>
                  <td className="py-[var(--space-3)] pl-[var(--space-2)] text-right">
                    <span className="inline-flex items-center rounded-[var(--radius-full)] bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 tabular-nums"
                      style={{ fontSize: 'var(--text-xs)' }}>
                      {data.forecast.confidence}% confidence
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
