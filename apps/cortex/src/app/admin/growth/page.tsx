'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Rocket, Building2, Target, Users, Mail, TrendingUp,
  Plus, Search, Filter, ChevronRight, ArrowUpRight,
  Globe, Briefcase, AlertCircle, CheckCircle2, Clock,
  BarChart3, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string;
  size: string | null;
  employees: number | null;
  location: string | null;
  status: string;
  qualificationScore: number | null;
  qualificationGrade: string | null;
  aiSummary: string | null;
  confidence: number | null;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  counts: { contacts: number; opportunities: number; outreachSequences: number; growthActivities: number };
}

interface Analytics {
  summary: {
    totalCompanies: number;
    qualified: number;
    totalOpportunities: number;
    pipelineValue: number;
    totalContacts: number;
    totalSequences: number;
    conversionRate: number;
  };
  funnel: Record<string, number>;
  companiesByGrade: { grade: string; count: number }[];
  companiesByIndustry: { industry: string; count: number }[];
  opportunitiesByStage: { stage: string; count: number; value: number }[];
  outreachByStatus: { status: string; count: number }[];
  recentActivities: {
    id: string; type: string; content: string;
    company: { id: string; name: string } | null;
    user: { id: string; name: string } | null;
    createdAt: string;
  }[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Building2 }> = {
  discovered: { label: 'Discovered', color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400', icon: Search },
  researching: { label: 'Researching', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', icon: Globe },
  qualified: { label: 'Qualified', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', icon: CheckCircle2 },
  outreach: { label: 'Outreach', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', icon: Mail },
  engaged: { label: 'Engaged', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400', icon: Users },
  meeting: { label: 'Meeting', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400', icon: Briefcase },
  proposal: { label: 'Proposal', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', icon: Target },
  won: { label: 'Won', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', icon: CheckCircle2 },
  lost: { label: 'Lost', color: 'bg-red-500/10 text-red-600 dark:text-red-400', icon: AlertCircle },
  dormant: { label: 'Dormant', color: 'bg-zinc-500/10 text-zinc-500', icon: Clock },
};

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  B: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  C: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  D: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  F: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

const FUNNEL_STEPS = ['discovered', 'researching', 'qualified', 'outreach', 'engaged', 'meeting', 'proposal', 'won'];
const FUNNEL_COLORS = ['bg-zinc-400', 'bg-blue-400', 'bg-indigo-500', 'bg-amber-500', 'bg-purple-500', 'bg-cyan-500', 'bg-orange-500', 'bg-emerald-500'];

const ACTIVITY_ICONS: Record<string, string> = {
  discovery: '🔍', qualification: '✅', outreach: '📧', research: '🔬',
  opportunity: '🎯', note: '📝', meeting: '🤝', status_change: '🔄',
};

function formatCurrency(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n}`;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function GrowthPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { router.replace('/'); return; }
    const headers = { Authorization: `Bearer ${token}` };

    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (gradeFilter) params.set('grade', gradeFilter);

      const [companiesRes, analyticsRes] = await Promise.all([
        fetch(`/api/growth/companies?${params}`, { headers }),
        fetch('/api/growth/analytics', { headers }),
      ]);

      if (!companiesRes.ok || !analyticsRes.ok) {
        setError('Failed to load growth data');
        return;
      }

      const companiesData = await companiesRes.json();
      const analyticsData = await analyticsRes.json();
      setCompanies(companiesData.companies);
      setAnalytics(analyticsData);
    } catch {
      setError('Failed to load growth data');
    } finally {
      setLoading(false);
    }
  }, [router, search, statusFilter, gradeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
          <p className="text-sm text-muted-foreground">Loading Growth Engine...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={() => { setError(''); setLoading(true); fetchData(); }}
            className="rounded-lg bg-foreground px-4 py-2 text-sm text-background transition-colors hover:opacity-90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const s = analytics?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            Growth Engine
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            B2B pipeline — discovery to deal close
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Company
        </button>
      </div>

      {/* KPI Cards */}
      {s && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          {[
            { label: 'Companies', value: s.totalCompanies, icon: Building2, color: 'text-blue-500' },
            { label: 'Qualified', value: s.qualified, icon: CheckCircle2, color: 'text-emerald-500' },
            { label: 'Opportunities', value: s.totalOpportunities, icon: Target, color: 'text-amber-500' },
            { label: 'Pipeline', value: formatCurrency(s.pipelineValue), icon: TrendingUp, color: 'text-purple-500' },
            { label: 'Contacts', value: s.totalContacts, icon: Users, color: 'text-cyan-500' },
            { label: 'Sequences', value: s.totalSequences, icon: Mail, color: 'text-orange-500' },
          ].map(kpi => (
            <div key={kpi.label}
              className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <kpi.icon className={cn('h-5 w-5', kpi.color)} />
                <span className="text-2xl font-bold text-foreground">{kpi.value}</span>
              </div>
              <p className="mt-2 text-xs font-medium text-muted-foreground">{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Funnel + Grade Distribution */}
      {analytics && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Funnel */}
          <div className="col-span-2 rounded-2xl border border-border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Pipeline Funnel
            </h3>
            <div className="space-y-2">
              {FUNNEL_STEPS.map((step, i) => {
                const count = analytics.funnel[step] || 0;
                const maxCount = Math.max(...FUNNEL_STEPS.map(s => analytics.funnel[s] || 0), 1);
                const pct = (count / maxCount) * 100;
                const cfg = STATUS_CONFIG[step];
                return (
                  <button key={step} onClick={() => setStatusFilter(statusFilter === step ? '' : step)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                      statusFilter === step ? 'bg-muted' : 'hover:bg-muted/50'
                    )}>
                    <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{cfg?.label || step}</span>
                    <div className="flex-1">
                      <div className="h-5 w-full rounded-full bg-muted">
                        <div className={cn('h-5 rounded-full transition-all', FUNNEL_COLORS[i])}
                          style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </div>
                    <span className="w-8 text-right text-sm font-semibold text-foreground">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grade + Industry */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Qualification Grades</h3>
              <div className="space-y-2">
                {['A', 'B', 'C', 'D', 'F'].map(grade => {
                  const item = analytics.companiesByGrade.find(g => g.grade === grade);
                  const count = item?.count || 0;
                  return (
                    <button key={grade} onClick={() => setGradeFilter(gradeFilter === grade ? '' : grade)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 transition-colors',
                        gradeFilter === grade ? 'bg-muted' : 'hover:bg-muted/50'
                      )}>
                      <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold', GRADE_COLORS[grade])}>
                        {grade}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Top Industries</h3>
              <div className="space-y-2">
                {analytics.companiesByIndustry.slice(0, 5).map(ind => (
                  <div key={ind.industry} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-muted-foreground">{ind.industry}</span>
                    <span className="font-semibold text-foreground">{ind.count}</span>
                  </div>
                ))}
                {analytics.companiesByIndustry.length === 0 && (
                  <p className="text-xs text-muted-foreground">No data yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {(statusFilter || gradeFilter) && (
          <button onClick={() => { setStatusFilter(''); setGradeFilter(''); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
            <Filter className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {/* Companies + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Company Table */}
        <div className="col-span-2 rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground">
              Companies <span className="text-muted-foreground font-normal">({companies.length})</span>
            </h3>
          </div>
          <div className="divide-y divide-border">
            {companies.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No companies found</p>
                <button onClick={() => setShowAddModal(true)}
                  className="rounded-lg bg-foreground px-4 py-2 text-sm text-background hover:opacity-90">
                  Add your first company
                </button>
              </div>
            ) : (
              companies.map(company => {
                const statusCfg = STATUS_CONFIG[company.status] || STATUS_CONFIG.discovered;
                const StatusIcon = statusCfg.icon;
                return (
                  <div key={company.id}
                    className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/30 cursor-pointer group"
                    onClick={() => router.push(`/admin/growth/${company.id}`)}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold text-muted-foreground">
                      {company.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{company.name}</p>
                        {company.qualificationGrade && (
                          <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold border', GRADE_COLORS[company.qualificationGrade])}>
                            {company.qualificationGrade}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground capitalize">{company.industry}</span>
                        {company.location && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{company.location}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />{company.counts.contacts}
                        <Target className="h-3 w-3 ml-1" />{company.counts.opportunities}
                      </div>
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium', statusCfg.color)}>
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Activity Feed
            </h3>
          </div>
          <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
            {(!analytics?.recentActivities || analytics.recentActivities.length === 0) ? (
              <div className="py-8 text-center">
                <p className="text-xs text-muted-foreground">No activity yet</p>
              </div>
            ) : (
              analytics.recentActivities.map(activity => (
                <div key={activity.id} className="px-5 py-3">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-sm">{ACTIVITY_ICONS[activity.type] || '📋'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground leading-snug">{activity.content}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {activity.company && (
                          <span className="font-medium">{activity.company.name}</span>
                        )}
                        {activity.user && (
                          <>
                            <span>·</span>
                            <span>{activity.user.name}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{timeAgo(activity.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Opportunity Pipeline */}
      {analytics && analytics.opportunitiesByStage.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-500" />
            Opportunity Pipeline
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {analytics.opportunitiesByStage.map(stage => (
              <div key={stage.stage} className="rounded-xl border border-border p-3 text-center">
                <p className="text-lg font-bold text-foreground">{stage.count}</p>
                <p className="text-[11px] capitalize text-muted-foreground">{stage.stage}</p>
                {stage.value > 0 && (
                  <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(stage.value)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Company Modal */}
      {showAddModal && <AddCompanyModal onClose={() => setShowAddModal(false)} onSuccess={() => { setShowAddModal(false); fetchData(); }} />}
    </div>
  );
}

function AddCompanyModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '', industry: '', website: '', size: '', location: '',
    employees: '', cloudProvider: '', description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.industry) { setError('Name and industry are required'); return; }

    setSaving(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/growth/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          employees: form.employees ? parseInt(form.employees) : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to add company');
        return;
      }
      onSuccess();
    } catch {
      setError('Failed to add company');
    } finally {
      setSaving(false);
    }
  }

  const industries = ['healthcare', 'fintech', 'ecommerce', 'saas', 'logistics', 'manufacturing', 'education', 'retail', 'telecom', 'energy'];
  const sizes = ['startup', 'small', 'medium', 'large', 'enterprise'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-foreground">Add Company</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Company Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g., TechCorp Solutions" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Industry *</label>
              <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select...</option>
                {industries.map(i => <option key={i} value={i} className="capitalize">{i}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Size</label>
              <select value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select...</option>
                {sizes.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Website</label>
              <input type="text" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="https://..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Employees</label>
              <input type="number" value={form.employees} onChange={e => setForm(f => ({ ...f, employees: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g., 150" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
              <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g., Hyderabad" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Cloud Provider</label>
              <select value={form.cloudProvider} onChange={e => setForm(f => ({ ...f, cloudProvider: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select...</option>
                <option value="aws">AWS</option>
                <option value="azure">Azure</option>
                <option value="gcp">GCP</option>
                <option value="hybrid">Hybrid</option>
                <option value="on_premise">On-Premise</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Brief company description..." />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50">
              {saving ? 'Adding...' : 'Add Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
