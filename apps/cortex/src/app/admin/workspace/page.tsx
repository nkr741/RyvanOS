'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, Clock, AlertTriangle, ArrowRight,
  TrendingUp, Target, Zap, Shield, Search, Play,
  Bell, ChevronRight, MessageSquare, PenLine, BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Priority {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  action: string;
  actionData?: Record<string, unknown>;
}

interface Milestone {
  id: number;
  label: string;
  current: number;
  target: number;
  done: boolean;
}

interface Reflection {
  id: string;
  type: 'gap' | 'manual';
  text: string;
  createdAt: string;
}

interface LearningScore {
  industriesLearned: number;
  objectionsCaptures: number;
  outcomePatterns: number;
  processInsights: number;
  totalLearnings: number;
  growth: number;
}

interface WorkspaceData {
  greeting: string;
  date: string;
  yesterday: { prospectsDiscovered: number; qualified: number; researchCompleted: number };
  pipeline: { total: number; weighted: number; opportunities: number };
  missions: { active: number; completed: number; total: number; successRate: number; totalRevenue: number };
  revenueGoal: { target: number; current: number; progress: number };
  milestones: Milestone[];
  priorities: Priority[];
  recommendation: string;
  notifications: Array<{ id: string; title: string; message: string; type: string; createdAt: string }>;
  health: { prospects: number; gradeA: number; pendingApprovals: number; playbooks: number };
  learningScore: LearningScore;
  reflections: Reflection[];
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function FounderWorkspace() {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const [gapText, setGapText] = useState('');
  const [manualText, setManualText] = useState('');
  const [reflectionSaving, setReflectionSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/founder/workspace', { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to load');
      const d = await res.json();
      setData(d);
    } catch {
      // Silently fail — workspace should never show errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (priority: Priority) => {
    setActionLoading(priority.id);
    try {
      if (priority.action === 'approve' && priority.actionData?.workItemId) {
        await fetch('/api/growth/execution', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'approve', workItemId: priority.actionData.workItemId }),
        });
        setCompletedActions(prev => new Set(prev).add(priority.id));
      } else if (priority.action === 'research' && priority.actionData?.prospectId) {
        await fetch('/api/growth/intelligence', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'request', prospectId: priority.actionData.prospectId }),
        });
        setCompletedActions(prev => new Set(prev).add(priority.id));
      } else if (priority.action === 'launch' && priority.actionData?.prospectId) {
        await fetch('/api/growth/execution', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ action: 'auto_execute', prospectId: priority.actionData.prospectId }),
        });
        setCompletedActions(prev => new Set(prev).add(priority.id));
      }
      // Refresh data after action
      setTimeout(() => load(), 500);
    } catch (err) {
      console.error("[admin/workspace] Failed to execute priority action", err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          <p className="text-sm text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const today = new Date(data.date);
  const dateStr = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const activePriorities = data.priorities.filter(p => !completedActions.has(p.id));

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{data.greeting}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{dateStr}</p>
      </div>

      {/* Yesterday */}
      {(data.yesterday.prospectsDiscovered > 0 || data.yesterday.qualified > 0 || data.yesterday.researchCompleted > 0) && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Yesterday</h2>
          <div className="space-y-2">
            {data.yesterday.prospectsDiscovered > 0 && (
              <YesterdayItem icon={Search} text={`${data.yesterday.prospectsDiscovered} prospect${data.yesterday.prospectsDiscovered !== 1 ? 's' : ''} discovered`} />
            )}
            {data.yesterday.qualified > 0 && (
              <YesterdayItem icon={Target} text={`${data.yesterday.qualified} qualified`} />
            )}
            {data.yesterday.researchCompleted > 0 && (
              <YesterdayItem icon={CheckCircle2} text={`${data.yesterday.researchCompleted} research mission${data.yesterday.researchCompleted !== 1 ? 's' : ''} completed`} />
            )}
          </div>
        </div>
      )}

      {/* Revenue Goal */}
      <div className="rounded-2xl border border-border bg-card px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Revenue Goal</p>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(data.revenueGoal.target)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Progress</p>
            <p className={cn(
              'text-2xl font-bold',
              data.revenueGoal.progress >= 50 ? 'text-emerald-500' :
              data.revenueGoal.progress >= 20 ? 'text-amber-500' :
              'text-foreground'
            )}>
              {data.revenueGoal.progress}%
            </p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              data.revenueGoal.progress >= 50 ? 'bg-emerald-500' :
              data.revenueGoal.progress >= 20 ? 'bg-amber-500' :
              'bg-foreground/60'
            )}
            style={{ width: `${Math.max(1, data.revenueGoal.progress)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {formatCurrency(data.revenueGoal.current)} of {formatCurrency(data.revenueGoal.target)}
        </p>
      </div>

      {/* Milestones */}
      {data.milestones && data.milestones.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Milestones</h2>
          <div className="space-y-2">
            {data.milestones.map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <div className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  m.done ? 'bg-emerald-500/10' : 'bg-muted'
                )}>
                  {m.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">{m.id}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', m.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                    {m.label}
                  </p>
                </div>
                <span className={cn(
                  'text-xs font-medium tabular-nums',
                  m.done ? 'text-emerald-500' : 'text-muted-foreground'
                )}>
                  {m.current}/{m.target}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Priorities */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Today&apos;s Priorities
        </h2>
        {activePriorities.length > 0 ? (
          <div className="space-y-2">
            {activePriorities.map((p, i) => (
              <PriorityItem
                key={p.id}
                priority={p}
                index={i + 1}
                onAction={() => handleAction(p)}
                loading={actionLoading === p.id}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500/60" />
            <p className="text-sm font-medium text-foreground">All clear.</p>
            <p className="mt-1 text-xs text-muted-foreground">No pending actions. Discover new prospects or review your pipeline.</p>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Pipeline"
          value={formatCurrency(data.pipeline.weighted)}
          sublabel={`${data.pipeline.opportunities} opportunities`}
          icon={TrendingUp}
        />
        <MetricCard
          label="Mission Health"
          value={`${data.missions.successRate}%`}
          sublabel={`${data.missions.completed} of ${data.missions.total} complete`}
          icon={Zap}
          variant={data.missions.successRate >= 80 ? 'success' : data.missions.successRate >= 50 ? 'neutral' : 'warning'}
        />
      </div>

      {/* Revenue */}
      {data.missions.totalRevenue > 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Revenue Won</p>
              <p className="text-xl font-bold text-emerald-500">{formatCurrency(data.missions.totalRevenue)}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
        </div>
      )}

      {/* Recommendation */}
      {data.recommendation && (
        <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommendation</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{data.recommendation}</p>
        </div>
      )}

      {/* Business Learning Score */}
      {data.learningScore && (
        <div className="rounded-2xl border border-border bg-card px-5 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-violet-500" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Business Learning Score
              </h3>
            </div>
            {data.learningScore.growth !== 0 && (
              <span className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                data.learningScore.growth > 0
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'bg-amber-500/10 text-amber-500'
              )}>
                {data.learningScore.growth > 0 ? '+' : ''}{data.learningScore.growth}%
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">This month</p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3">
            <LearningRow label="Industries Learned" value={data.learningScore.industriesLearned} />
            <LearningRow label="Objections Captured" value={data.learningScore.objectionsCaptures} />
            <LearningRow label="Outcome Patterns" value={data.learningScore.outcomePatterns} />
            <LearningRow label="Process Insights" value={data.learningScore.processInsights} />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs font-medium text-muted-foreground">Total Learnings</span>
            <span className="text-lg font-bold text-foreground">{data.learningScore.totalLearnings}</span>
          </div>
        </div>
      )}

      {/* Completed actions feedback */}
      {completedActions.size > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/5 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{completedActions.size} action{completedActions.size !== 1 ? 's' : ''} completed this session</span>
        </div>
      )}

      {/* Daily Reflection */}
      <div className="space-y-4 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">End of Day</h2>

        <ReflectionInput
          icon={AlertTriangle}
          label="What did Cortex fail to do today?"
          placeholder="e.g. Couldn't find the CTO's contact info for Apex Corp..."
          value={gapText}
          onChange={setGapText}
          onSave={async () => {
            if (!gapText.trim()) return;
            setReflectionSaving(true);
            await fetch('/api/founder/workspace', {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ action: 'log_reflection', type: 'gap', text: gapText.trim() }),
            });
            setGapText('');
            setReflectionSaving(false);
            load();
          }}
          saving={reflectionSaving}
        />

        <ReflectionInput
          icon={PenLine}
          label="What did I do manually that Cortex should handle?"
          placeholder="e.g. Spent 30 min researching a company's tech stack on LinkedIn..."
          value={manualText}
          onChange={setManualText}
          onSave={async () => {
            if (!manualText.trim()) return;
            setReflectionSaving(true);
            await fetch('/api/founder/workspace', {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ action: 'log_reflection', type: 'manual', text: manualText.trim() }),
            });
            setManualText('');
            setReflectionSaving(false);
            load();
          }}
          saving={reflectionSaving}
        />

        {/* Recent reflections */}
        {data.reflections && data.reflections.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-muted-foreground">Recent logs</p>
            {data.reflections.map(r => (
              <div key={r.id} className="flex items-start gap-3 rounded-xl bg-muted/30 px-4 py-3">
                {r.type === 'gap' ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                ) : (
                  <PenLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{r.text}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function ReflectionInput({ icon: Icon, label, placeholder, value, onChange, onSave, saving }: {
  icon: React.ElementType; label: string; placeholder: string;
  value: string; onChange: (v: string) => void; onSave: () => void; saving: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
        <button
          onClick={onSave}
          disabled={saving || !value.trim()}
          className="shrink-0 rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-[color:var(--background)] transition-colors hover:bg-foreground/90 disabled:opacity-30"
        >
          Log
        </button>
      </div>
    </div>
  );
}

function YesterdayItem({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-foreground/80">
      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <span>{text}</span>
    </div>
  );
}

function PriorityItem({ priority, index, onAction, loading }: {
  priority: Priority; index: number; onAction: () => void; loading: boolean;
}) {
  const typeConfig: Record<string, { icon: React.ElementType; color: string; actionLabel: string }> = {
    approval: { icon: Shield, color: 'text-amber-500', actionLabel: 'Approve' },
    research: { icon: Search, color: 'text-blue-500', actionLabel: 'Start' },
    execute: { icon: Play, color: 'text-emerald-500', actionLabel: 'Launch' },
  };
  const config = typeConfig[priority.type] || { icon: ChevronRight, color: 'text-foreground', actionLabel: 'Do' };
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:bg-muted/30">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-[color:var(--background)]">
        {index}
      </span>
      <Icon className={cn('h-4.5 w-4.5 shrink-0', config.color)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{priority.title}</p>
        <p className="truncate text-xs text-muted-foreground">{priority.subtitle}</p>
      </div>
      <button
        onClick={onAction}
        disabled={loading}
        className="shrink-0 rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-[color:var(--background)] transition-colors hover:bg-foreground/90 disabled:opacity-50"
      >
        {loading ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
        ) : (
          config.actionLabel
        )}
      </button>
    </div>
  );
}

function MetricCard({ label, value, sublabel, icon: Icon, variant = 'neutral' }: {
  label: string; value: string; sublabel: string; icon: React.ElementType;
  variant?: 'neutral' | 'success' | 'warning';
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn(
            'mt-1 text-xl font-bold',
            variant === 'success' ? 'text-emerald-500' :
            variant === 'warning' ? 'text-amber-500' :
            'text-foreground'
          )}>
            {value}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>
        </div>
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl',
          variant === 'success' ? 'bg-emerald-500/10' :
          variant === 'warning' ? 'bg-amber-500/10' :
          'bg-foreground/5'
        )}>
          <Icon className={cn(
            'h-4.5 w-4.5',
            variant === 'success' ? 'text-emerald-500' :
            variant === 'warning' ? 'text-amber-500' :
            'text-foreground'
          )} />
        </div>
      </div>
    </div>
  );
}

function LearningRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn(
        'text-sm font-semibold tabular-nums',
        value > 0 ? 'text-foreground' : 'text-muted-foreground/50'
      )}>
        {value}
      </span>
    </div>
  );
}

function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  if (amount === 0) return '₹0';
  return `₹${amount.toLocaleString('en-IN')}`;
}
