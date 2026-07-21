'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, Plus, Filter, ChevronRight, ArrowUpRight,
  Globe, AlertCircle, CheckCircle2, Clock, X,
  Zap, Target, Upload, Eye, XCircle, Star,
  Activity, Database, TrendingUp, Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Signal {
  id: string;
  type: string;
  value: string;
  confidence: number;
  importance: string;
}

interface Candidate {
  id: string;
  companyName: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  employees: number | null;
  location: string | null;
  description: string | null;
  status: string;
  confidence: number;
  qualificationScore: number | null;
  qualificationGrade: string | null;
  createdAt: string;
  source: { displayName: string; trustScore: number };
  signals: Signal[];
}

interface Prospect {
  id: string;
  companyName: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  qualificationScore: number | null;
  qualificationGrade: string | null;
  status: string;
  source: string;
  createdAt: string;
  signals: Signal[];
  assignedTo: { name: string } | null;
}

interface RunInfo {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  stats: string;
  triggeredBy: string;
  source: { displayName: string };
  _count: { candidates: number };
}

interface Funnel {
  discovered: number;
  new: number;
  qualified: number;
  promoted: number;
  rejected: number;
  prospects: number;
  signals: number;
}

const GRADE_COLORS: Record<string, string> = {
  A: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  B: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  C: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  D: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  F: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

const SIGNAL_ICONS: Record<string, string> = {
  hiring: '👥', technology: '💻', cloud: '☁️', growth: '📈',
  pain: '⚠️', partnership: '🤝', funding: '💰', certification: '✅', expansion: '🌍',
};

const IMPORTANCE_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
  high: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  low: 'bg-zinc-500/10 text-zinc-500',
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type Tab = 'review' | 'prospects' | 'runs';

export default function DiscoveryHubPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('review');
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showDiscover, setShowDiscover] = useState(false);
  const [filterStatus, setFilterStatus] = useState('new');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

  const fetchDashboard = useCallback(async () => {
    if (!token) { router.replace('/'); return; }
    try {
      const res = await fetch('/api/growth/discovery', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError('Failed to load'); return; }
      const data = await res.json();
      setFunnel(data.funnel);
      setRuns(data.recentRuns || []);
    } catch { setError('Failed to load'); }
  }, [token, router]);

  const fetchCandidates = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`/api/growth/discovery?view=candidates&status=${filterStatus}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setCandidates(data.candidates);
    }
  }, [token, filterStatus]);

  const fetchProspects = useCallback(async () => {
    if (!token) return;
    const res = await fetch('/api/growth/discovery?view=prospects', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setProspects(data.prospects);
    }
  }, [token]);

  const fetchRuns = useCallback(async () => {
    if (!token) return;
    const res = await fetch('/api/growth/discovery?view=runs', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setRuns(data.runs);
    }
  }, [token]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchDashboard();
      await fetchCandidates();
      setLoading(false);
    }
    init();
  }, [fetchDashboard, fetchCandidates]);

  useEffect(() => {
    if (tab === 'prospects') fetchProspects();
    if (tab === 'runs') fetchRuns();
  }, [tab, fetchProspects, fetchRuns]);

  useEffect(() => { fetchCandidates(); }, [filterStatus, fetchCandidates]);

  async function doAction(action: string, candidateId: string, config?: Record<string, unknown>) {
    setActionLoading(candidateId);
    try {
      await fetch('/api/growth/discovery', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ action, candidateId, config }),
      });
      await fetchCandidates();
      await fetchDashboard();
    } catch (err) { console.error("[admin/discovery] Failed to handle candidate action", err); }
    setActionLoading(null);
  }

  async function batchQualify() {
    setActionLoading('batch');
    try {
      await fetch('/api/growth/discovery', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ action: 'batch_qualify' }),
      });
      await fetchCandidates();
      await fetchDashboard();
    } catch (err) { console.error("[admin/discovery] Failed to batch qualify candidates", err); }
    setActionLoading(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Discovery Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">Continuously discover, qualify, and promote business opportunities</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={batchQualify} disabled={!!actionLoading}
            className="rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
            <Zap className="mr-1.5 inline h-3.5 w-3.5" />Qualify All New
          </button>
          <button onClick={() => setShowDiscover(true)}
            className="rounded-xl bg-foreground px-4 py-2.5 text-xs font-medium text-[color:var(--background)] hover:opacity-90">
            <Plus className="mr-1.5 inline h-3.5 w-3.5" />Discover
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />{error}
          <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Discovery Funnel */}
      {funnel && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: 'Discovered', value: funnel.discovered, icon: Search, color: 'text-zinc-500' },
            { label: 'New', value: funnel.new, icon: Star, color: 'text-blue-500' },
            { label: 'Signals', value: funnel.signals, icon: Activity, color: 'text-purple-500' },
            { label: 'Qualified', value: funnel.qualified, icon: CheckCircle2, color: 'text-indigo-500' },
            { label: 'Promoted', value: funnel.promoted, icon: ArrowUpRight, color: 'text-emerald-500' },
            { label: 'Prospects', value: funnel.prospects, icon: Target, color: 'text-amber-500' },
            { label: 'Rejected', value: funnel.rejected, icon: XCircle, color: 'text-red-500' },
          ].map(m => (
            <div key={m.label} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <m.icon className={cn('h-4 w-4', m.color)} />
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { key: 'review' as Tab, label: 'Review Queue', count: funnel?.new },
          { key: 'prospects' as Tab, label: 'Prospects', count: funnel?.prospects },
          { key: 'runs' as Tab, label: 'Discovery Runs' },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Review Queue Tab */}
      {tab === 'review' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="new">New</option>
              <option value="qualified">Qualified</option>
              <option value="enriching">Enriching</option>
              <option value="promoted">Promoted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          {candidates.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card py-16 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No candidates with status &quot;{filterStatus}&quot;</p>
              <button onClick={() => setShowDiscover(true)}
                className="mt-3 text-sm text-primary underline">Run a discovery</button>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map(c => (
                <CandidateCard key={c.id} candidate={c}
                  loading={actionLoading === c.id}
                  onQualify={() => {
                    doAction('extract_signals', c.id).then(() => doAction('qualify', c.id));
                  }}
                  onPromote={() => doAction('promote', c.id)}
                  onReject={() => doAction('reject', c.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prospects Tab */}
      {tab === 'prospects' && (
        <div>
          {prospects.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card py-16 text-center">
              <Target className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No prospects yet. Promote qualified candidates to create prospects.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prospects.map(p => (
                <div key={p.id} className="rounded-2xl border border-border bg-card p-5 hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold text-muted-foreground">
                        {p.companyName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{p.companyName}</h3>
                          {p.qualificationGrade && (
                            <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-bold', GRADE_COLORS[p.qualificationGrade])}>
                              {p.qualificationGrade}
                            </span>
                          )}
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 capitalize">{p.status}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          {p.industry && <span className="capitalize">{p.industry}</span>}
                          {p.size && <><span>·</span><span className="capitalize">{p.size}</span></>}
                          <span>·</span><span>from {p.source}</span>
                          <span>·</span><span>{timeAgo(p.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    {p.qualificationScore != null && (
                      <span className="text-lg font-bold text-foreground">{p.qualificationScore}</span>
                    )}
                  </div>
                  {p.signals.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.signals.slice(0, 8).map(s => (
                        <span key={s.id} className={cn('rounded-lg px-2 py-0.5 text-[10px] font-medium', IMPORTANCE_COLORS[s.importance] || IMPORTANCE_COLORS.medium)}>
                          {SIGNAL_ICONS[s.type] || '📋'} {s.value}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Runs Tab */}
      {tab === 'runs' && (
        <div>
          {runs.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card py-16 text-center">
              <Database className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No discovery runs yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map(run => {
                const stats = JSON.parse(run.stats || '{}');
                return (
                  <div key={run.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('h-2 w-2 rounded-full',
                          run.status === 'completed' ? 'bg-emerald-500' :
                          run.status === 'running' ? 'bg-blue-500 animate-pulse' :
                          'bg-red-500'
                        )} />
                        <span className="text-sm font-medium text-foreground">{run.source.displayName}</span>
                        <span className="text-xs text-muted-foreground capitalize">{run.triggeredBy}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{timeAgo(run.startedAt)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{stats.discovered || 0} discovered</span>
                      <span>{stats.signals || 0} signals</span>
                      <span>{stats.duplicates || 0} duplicates</span>
                      {stats.failed > 0 && <span className="text-red-500">{stats.failed} failed</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Discover Modal */}
      {showDiscover && (
        <DiscoverModal
          onClose={() => setShowDiscover(false)}
          onSuccess={() => {
            setShowDiscover(false);
            fetchCandidates();
            fetchDashboard();
          }}
        />
      )}
    </div>
  );
}

function CandidateCard({ candidate: c, loading, onQualify, onPromote, onReject }: {
  candidate: Candidate;
  loading: boolean;
  onQualify: () => void;
  onPromote: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-bold text-muted-foreground">
            {c.companyName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{c.companyName}</h3>
              {c.qualificationGrade && (
                <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-bold', GRADE_COLORS[c.qualificationGrade])}>
                  {c.qualificationGrade}
                </span>
              )}
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium',
                c.status === 'new' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                c.status === 'qualified' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' :
                c.status === 'promoted' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                c.status === 'rejected' ? 'bg-red-500/10 text-red-500' :
                'bg-zinc-500/10 text-zinc-500'
              )}>
                {c.status}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
              {c.industry && <span className="capitalize">{c.industry}</span>}
              {c.size && <><span>·</span><span className="capitalize">{c.size}</span></>}
              {c.location && <><span>·</span><span>{c.location}</span></>}
              <span>·</span>
              <span>{c.source.displayName} ({c.source.trustScore}% trust)</span>
              <span>·</span>
              <span>{timeAgo(c.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {c.qualificationScore != null && (
            <span className="text-lg font-bold text-foreground">{c.qualificationScore}</span>
          )}
          {c.website && (
            <a href={c.website} target="_blank" rel="noopener noreferrer"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
              <Globe className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* Signals */}
      {c.signals.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.signals.map(s => (
            <span key={s.id} className={cn('rounded-lg px-2 py-0.5 text-[10px] font-medium', IMPORTANCE_COLORS[s.importance] || IMPORTANCE_COLORS.medium)}>
              {SIGNAL_ICONS[s.type] || '📋'} {s.value}
              <span className="ml-1 opacity-60">{s.confidence}%</span>
            </span>
          ))}
        </div>
      )}

      {c.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{c.description}</p>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        {c.status === 'new' && (
          <button onClick={onQualify} disabled={loading}
            className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
            <Zap className="mr-1 inline h-3 w-3" />Qualify
          </button>
        )}
        {(c.status === 'qualified' || c.status === 'new') && (
          <button onClick={onPromote} disabled={loading}
            className="rounded-xl bg-foreground px-3 py-1.5 text-xs font-medium text-[color:var(--background)] hover:opacity-90 disabled:opacity-50">
            <ArrowUpRight className="mr-1 inline h-3 w-3" />Promote
          </button>
        )}
        {c.status !== 'rejected' && c.status !== 'promoted' && (
          <button onClick={onReject} disabled={loading}
            className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/5 disabled:opacity-50">
            <XCircle className="mr-1 inline h-3 w-3" />Reject
          </button>
        )}
        {loading && <div className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />}
      </div>
    </div>
  );
}

function DiscoverModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<'manual' | 'csv' | 'website'>('manual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ discovered: number; errors: string[] } | null>(null);

  // Manual form
  const [form, setForm] = useState({
    companyName: '', website: '', industry: '', size: '', employees: '',
    location: '', description: '',
  });

  // CSV
  const [csvText, setCsvText] = useState('');

  // Website
  const [urls, setUrls] = useState('');

  async function handleSubmit() {
    setSaving(true);
    setError('');
    const token = localStorage.getItem('token');

    try {
      let body: Record<string, unknown>;

      if (mode === 'manual') {
        if (!form.companyName) { setError('Company name is required'); setSaving(false); return; }
        body = {
          action: 'discover',
          provider: 'manual',
          config: {
            candidates: [{
              companyName: form.companyName,
              website: form.website || undefined,
              industry: form.industry || undefined,
              size: form.size || undefined,
              employees: form.employees ? parseInt(form.employees) : undefined,
              location: form.location || undefined,
              description: form.description || undefined,
              rawData: { ...form },
            }],
          },
        };
      } else if (mode === 'csv') {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) { setError('CSV needs a header row and at least one data row'); setSaving(false); return; }
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const row: Record<string, string> = {};
          headers.forEach((h, i) => { row[h] = values[i] || ''; });
          return row;
        });
        body = { action: 'discover', provider: 'csv_import', config: { rows } };
      } else {
        const urlList = urls.trim().split('\n').map(u => u.trim()).filter(Boolean);
        if (urlList.length === 0) { setError('Enter at least one URL'); setSaving(false); return; }
        body = { action: 'discover', provider: 'website_intel', config: { urls: urlList } };
      }

      const res = await fetch('/api/growth/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Discovery failed');
        setSaving(false);
        return;
      }

      const data = await res.json();
      setResult({ discovered: data.discovered, errors: data.errors });

      if (data.discovered > 0) {
        setTimeout(onSuccess, 1500);
      }
    } catch {
      setError('Discovery failed');
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Discover Companies</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-4 rounded-xl bg-muted p-1">
          {([
            { key: 'manual' as const, label: 'Manual', icon: Plus },
            { key: 'csv' as const, label: 'CSV Import', icon: Upload },
            { key: 'website' as const, label: 'Website Intel', icon: Globe },
          ]).map(m => (
            <button key={m.key} onClick={() => { setMode(m.key); setResult(null); setError(''); }}
              className={cn('flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                mode === m.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <m.icon className="mr-1 inline h-3 w-3" />{m.label}
            </button>
          ))}
        </div>

        {/* Manual Form */}
        {mode === 'manual' && (
          <div className="space-y-3">
            <input type="text" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              placeholder="Company name *" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input type="text" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
              placeholder="Website URL" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <div className="grid grid-cols-2 gap-3">
              <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Industry...</option>
                {['healthcare', 'fintech', 'ecommerce', 'saas', 'logistics', 'manufacturing', 'education', 'retail', 'telecom', 'energy'].map(i => (
                  <option key={i} value={i} className="capitalize">{i}</option>
                ))}
              </select>
              <select value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))}
                className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Size...</option>
                {['startup', 'small', 'medium', 'large', 'enterprise'].map(s => (
                  <option key={s} value={s} className="capitalize">{s}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" value={form.employees} onChange={e => setForm(f => ({ ...f, employees: e.target.value }))}
                placeholder="Employees" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              <input type="text" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Location" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} placeholder="Description, tech stack, pain points..." className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        )}

        {/* CSV Form */}
        {mode === 'csv' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Paste CSV data. First row = headers. Supported columns: company_name, website, industry, size, employees, location, tech_stack, cloud_provider</p>
            <textarea value={csvText} onChange={e => setCsvText(e.target.value)}
              rows={8} placeholder={'company_name,website,industry,size,location\nABC Tech,abc.com,saas,medium,Hyderabad\nXYZ Health,xyz.io,healthcare,large,Bangalore'}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        )}

        {/* Website Form */}
        {mode === 'website' && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter company website URLs (one per line). Cortex will extract company intelligence and signals.</p>
            <textarea value={urls} onChange={e => setUrls(e.target.value)}
              rows={6} placeholder={'https://example.com\nhttps://another-company.io'}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
        )}

        {/* Result */}
        {result && (
          <div className={cn('mt-3 rounded-xl p-3 text-sm',
            result.discovered > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
            <p className="font-medium">{result.discovered} companies discovered</p>
            {result.errors.length > 0 && (
              <ul className="mt-1 text-xs opacity-80">
                {result.errors.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-[color:var(--background)] hover:opacity-90 disabled:opacity-50">
            {saving ? 'Discovering...' : 'Run Discovery'}
          </button>
        </div>
      </div>
    </div>
  );
}
