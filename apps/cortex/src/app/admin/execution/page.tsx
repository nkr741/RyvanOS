'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Play, CheckCircle2, Clock, AlertTriangle, XCircle, Pause,
  ArrowRight, ChevronDown, ChevronRight, RefreshCw, Target,
  Zap, BarChart3, FileText, Mail, Users, Briefcase, Shield,
  TrendingUp, Award, SkipForward, Eye, Activity, Layers, Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkItem {
  id: string;
  stageId: string;
  stageName: string;
  executorType: string;
  status: string;
  sequence: number;
  input: string;
  output: string;
  approvalRequired: boolean;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

interface Outcome {
  id: string;
  result: string;
  reason: string | null;
  revenue: number | null;
  lessons: string;
  recommendations: string;
}

interface Mission {
  id: string;
  title: string;
  status: string;
  progress: number;
  playbookName: string | null;
  prospectId: string | null;
  createdAt: string;
  completedAt: string | null;
  workItems: WorkItem[];
  outcome: Outcome | null;
}

interface PlaybookStage {
  id: string;
  name: string;
  executorType: string;
  approvalRequired: boolean;
  autoAdvance: boolean;
}

interface Playbook {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  domain: string;
  active: boolean;
  stages: PlaybookStage[];
  metrics: Record<string, number>;
}

interface Prospect {
  id: string;
  companyName: string;
  qualificationGrade: string | null;
  qualificationScore: number | null;
  industry: string | null;
  size: string | null;
}

interface Dashboard {
  totalMissions: number;
  activeMissions: number;
  completedMissions: number;
  totalOutcomes: number;
  playbooks: number;
  activeRules: number;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function api(path: string, options?: RequestInit) {
  const res = await fetch(path, { ...options, headers: { ...authHeaders(), ...options?.headers } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export default function ExecutionPage() {
  const [tab, setTab] = useState<'dashboard' | 'missions' | 'playbooks' | 'launch'>('dashboard');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProspect, setSelectedProspect] = useState<string>('');
  const [matchedPlaybook, setMatchedPlaybook] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [launching, setLaunching] = useState(false);

  const [expandedMission, setExpandedMission] = useState<string | null>(null);
  const [missionDetail, setMissionDetail] = useState<Record<string, unknown> | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [outcomeModal, setOutcomeModal] = useState<string | null>(null);
  const [outcomeForm, setOutcomeForm] = useState({ result: 'won', reason: '', revenue: '', evidence: '' });

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await api('/api/growth/execution?view=dashboard');
      setDashboard(data.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  const loadMissions = useCallback(async () => {
    try {
      const data = await api('/api/growth/execution?view=missions');
      setMissions(data.missions);
    } catch (err) { console.error("[admin/execution] Failed to fetch missions", err); }
  }, []);

  const loadPlaybooks = useCallback(async () => {
    try {
      const data = await api('/api/growth/execution?view=playbooks');
      setPlaybooks(data.playbooks);
    } catch (err) { console.error("[admin/execution] Failed to fetch playbooks", err); }
  }, []);

  const loadProspects = useCallback(async () => {
    try {
      const data = await api('/api/growth/discovery?view=prospects');
      setProspects((data.prospects || []).map((p: Record<string, unknown>) => ({
        id: p.id,
        companyName: p.companyName,
        qualificationGrade: p.qualificationGrade,
        qualificationScore: p.qualificationScore,
        industry: p.industry,
        size: p.size,
      })));
    } catch (err) { console.error("[admin/execution] Failed to fetch prospects", err); }
  }, []);

  useEffect(() => {
    Promise.all([loadDashboard(), loadMissions(), loadPlaybooks(), loadProspects()])
      .finally(() => setLoading(false));
  }, [loadDashboard, loadMissions, loadPlaybooks, loadProspects]);

  const handleMatchPlaybook = async (prospectId: string) => {
    setSelectedProspect(prospectId);
    setMatchedPlaybook(null);
    if (!prospectId) return;
    setMatching(true);
    try {
      const data = await api(`/api/growth/execution?view=match&prospectId=${prospectId}`);
      setMatchedPlaybook(data.matchedPlaybook);
    } catch {
      setMatchedPlaybook(null);
    } finally {
      setMatching(false);
    }
  };

  const handleLaunch = async () => {
    if (!selectedProspect) return;
    setLaunching(true);
    try {
      const data = await api('/api/growth/execution', {
        method: 'POST',
        body: JSON.stringify({ action: 'auto_execute', prospectId: selectedProspect }),
      });
      setTab('missions');
      await loadMissions();
      await loadDashboard();
      setExpandedMission(data.missionId);
      setSelectedProspect('');
      setMatchedPlaybook(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  };

  const handleApprove = async (workItemId: string, recipientEmail?: string) => {
    setActionLoading(workItemId);
    try {
      const payload: Record<string, unknown> = { action: 'approve', workItemId };
      if (recipientEmail) payload.recipientEmail = recipientEmail;
      const result = await api('/api/growth/execution', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (result.emailSent) {
        setError(null);
      } else if (result.emailError) {
        setError(result.emailError);
      }
      await loadMissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkip = async (workItemId: string) => {
    setActionLoading(workItemId);
    try {
      await api('/api/growth/execution', {
        method: 'POST',
        body: JSON.stringify({ action: 'skip', workItemId }),
      });
      await loadMissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Skip failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecordOutcome = async (missionId: string) => {
    setActionLoading(missionId);
    try {
      await api('/api/growth/execution', {
        method: 'POST',
        body: JSON.stringify({
          action: 'record_outcome',
          missionId,
          result: outcomeForm.result,
          reason: outcomeForm.reason || undefined,
          revenue: outcomeForm.revenue ? parseFloat(outcomeForm.revenue) : undefined,
          evidence: outcomeForm.evidence || undefined,
        }),
      });
      setOutcomeModal(null);
      setOutcomeForm({ result: 'won', reason: '', revenue: '', evidence: '' });
      await loadMissions();
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record outcome');
    } finally {
      setActionLoading(null);
    }
  };

  const loadMissionDetail = async (missionId: string) => {
    if (expandedMission === missionId) {
      setExpandedMission(null);
      setMissionDetail(null);
      return;
    }
    setExpandedMission(missionId);
    setLoadingDetail(true);
    try {
      const data = await api(`/api/growth/execution?view=mission&id=${missionId}`);
      setMissionDetail(data.mission);
    } catch {
      setMissionDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([loadDashboard(), loadMissions(), loadPlaybooks()]);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
          <p className="text-sm text-muted-foreground">Loading Execution Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {(['dashboard', 'missions', 'playbooks', 'launch'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium capitalize transition-all',
                tab === t
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'launch' ? 'Launch Mission' : t}
            </button>
          ))}
        </div>
        <button onClick={refreshAll} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Dashboard Tab */}
      {tab === 'dashboard' && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard icon={Activity} label="Total Missions" value={dashboard.totalMissions} />
            <StatCard icon={Zap} label="Active" value={dashboard.activeMissions} variant="active" />
            <StatCard icon={CheckCircle2} label="Completed" value={dashboard.completedMissions} variant="success" />
            <StatCard icon={Award} label="Outcomes" value={dashboard.totalOutcomes} />
            <StatCard icon={Layers} label="Playbooks" value={dashboard.playbooks} />
            <StatCard icon={Shield} label="Active Rules" value={dashboard.activeRules} />
          </div>

          {/* Recent Missions Preview */}
          {missions.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Recent Missions</h3>
                <button onClick={() => setTab('missions')} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  View all <ArrowRight className="ml-1 inline h-3 w-3" />
                </button>
              </div>
              <div className="space-y-3">
                {missions.slice(0, 3).map(m => (
                  <MissionRow key={m.id} mission={m} compact onClick={() => { setTab('missions'); setExpandedMission(m.id); }} />
                ))}
              </div>
            </div>
          )}

          {missions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
              <Play className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <h3 className="text-sm font-semibold text-foreground">No missions yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">Launch your first execution mission to see results here.</p>
              <button
                onClick={() => setTab('launch')}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-[color:var(--background)] transition-colors hover:bg-foreground/90"
              >
                <Play className="h-4 w-4" /> Launch Mission
              </button>
            </div>
          )}
        </div>
      )}

      {/* Missions Tab */}
      {tab === 'missions' && (
        <div className="space-y-4">
          {missions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
              <p className="text-sm text-muted-foreground">No execution missions yet. Launch one from the Launch tab.</p>
            </div>
          ) : (
            missions.map(m => (
              <div key={m.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                <MissionRow mission={m} onClick={() => loadMissionDetail(m.id)} expanded={expandedMission === m.id} />

                {expandedMission === m.id && (
                  <div className="border-t border-border bg-muted/30 p-6">
                    {loadingDetail ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Work Items Timeline */}
                        <div>
                          <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Execution Timeline</h4>
                          <div className="space-y-0">
                            {m.workItems.map((wi, idx) => (
                              <WorkItemCard
                                key={wi.id}
                                item={wi}
                                isLast={idx === m.workItems.length - 1}
                                onApprove={(recipientEmail) => handleApprove(wi.id, recipientEmail)}
                                onSkip={() => handleSkip(wi.id)}
                                loading={actionLoading === wi.id}
                                missionDetail={missionDetail}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Outcome */}
                        {m.outcome ? (
                          <OutcomeCard outcome={m.outcome} />
                        ) : m.status === 'completed' && !m.outcome ? (
                          <div className="flex items-center justify-between rounded-xl border border-border bg-background p-4">
                            <div>
                              <p className="text-sm font-medium text-foreground">Mission Complete — Record Outcome</p>
                              <p className="text-xs text-muted-foreground">How did this engagement turn out?</p>
                            </div>
                            <button
                              onClick={() => setOutcomeModal(m.id)}
                              className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-[color:var(--background)] transition-colors hover:bg-foreground/90"
                            >
                              <Award className="h-4 w-4" /> Record Outcome
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Playbooks Tab */}
      {tab === 'playbooks' && (
        <div className="grid gap-4 lg:grid-cols-2">
          {playbooks.map(pb => (
            <PlaybookCard key={pb.id} playbook={pb} />
          ))}
        </div>
      )}

      {/* Launch Tab */}
      {tab === 'launch' && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-1 text-base font-semibold text-foreground">Launch Execution Mission</h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Select a prospect. Cortex will match the best playbook based on qualification, industry, and signals — then execute.
            </p>

            {/* Step 1: Select Prospect */}
            <div className="space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">1. Select Prospect</label>
              <select
                value={selectedProspect}
                onChange={e => handleMatchPlaybook(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              >
                <option value="">Choose a prospect...</option>
                {prospects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.companyName} — Grade {p.qualificationGrade || '?'} ({p.qualificationScore || 0}pts) — {p.industry || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Matched Playbook */}
            {selectedProspect && (
              <div className="mt-6 space-y-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">2. Matched Playbook</label>
                {matching ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
                    Matching rules...
                  </div>
                ) : matchedPlaybook ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/10">
                        <Target className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {playbooks.find(p => p.name === matchedPlaybook)?.displayName || matchedPlaybook}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {playbooks.find(p => p.name === matchedPlaybook)?.stages.length || '?'} stages
                          {' — '}
                          {playbooks.find(p => p.name === matchedPlaybook)?.description || ''}
                        </p>
                      </div>
                    </div>

                    {/* Playbook stages preview */}
                    {(() => {
                      const pb = playbooks.find(p => p.name === matchedPlaybook);
                      if (!pb) return null;
                      return (
                        <div className="mt-4 flex items-center gap-2">
                          {pb.stages.map((s, i) => (
                            <div key={s.id} className="flex items-center gap-2">
                              <div className="flex items-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-xs font-medium text-foreground">
                                <ExecutorIcon type={s.executorType} className="h-3.5 w-3.5" />
                                {s.name}
                                {s.approvalRequired && <Shield className="h-3 w-3 text-amber-500" />}
                              </div>
                              {i < pb.stages.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No matching playbook found for this prospect.</p>
                )}
              </div>
            )}

            {/* Step 3: Launch */}
            {matchedPlaybook && (
              <div className="mt-6">
                <button
                  onClick={handleLaunch}
                  disabled={launching}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-6 py-3 text-sm font-semibold text-[color:var(--background)] transition-colors hover:bg-foreground/90 disabled:opacity-50"
                >
                  {launching ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Launch Mission
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Outcome Modal */}
      {outcomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setOutcomeModal(null)}>
          <div className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="mb-4 text-base font-semibold text-foreground">Record Outcome</h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Result</label>
                <select
                  value={outcomeForm.result}
                  onChange={e => setOutcomeForm(f => ({ ...f, result: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                >
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                  <option value="no_response">No Response</option>
                  <option value="rejected">Rejected</option>
                  <option value="deferred">Deferred</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Reason</label>
                <input
                  type="text"
                  value={outcomeForm.reason}
                  onChange={e => setOutcomeForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Why did this happen?"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>

              {outcomeForm.result === 'won' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Revenue (INR)</label>
                  <input
                    type="number"
                    value={outcomeForm.revenue}
                    onChange={e => setOutcomeForm(f => ({ ...f, revenue: e.target.value }))}
                    placeholder="500000"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Evidence</label>
                <input
                  type="text"
                  value={outcomeForm.evidence}
                  onChange={e => setOutcomeForm(f => ({ ...f, evidence: e.target.value }))}
                  placeholder="How do you know?"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setOutcomeModal(null)}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRecordOutcome(outcomeModal)}
                disabled={actionLoading === outcomeModal}
                className="flex-1 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-[color:var(--background)] transition-colors hover:bg-foreground/90 disabled:opacity-50"
              >
                {actionLoading === outcomeModal ? 'Recording...' : 'Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({ icon: Icon, label, value, variant }: {
  icon: React.ElementType; label: string; value: number; variant?: 'active' | 'success';
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl',
          variant === 'active' ? 'bg-amber-500/10 text-amber-500' :
          variant === 'success' ? 'bg-emerald-500/10 text-emerald-500' :
          'bg-foreground/5 text-foreground'
        )}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function MissionRow({ mission: m, onClick, compact, expanded }: {
  mission: Mission; onClick?: () => void; compact?: boolean; expanded?: boolean;
}) {
  const StatusIcon = statusIcon(m.status);
  const statusColor = statusColorClass(m.status);
  return (
    <button onClick={onClick} className={cn(
      'flex w-full items-center gap-4 px-5 text-left transition-colors hover:bg-muted/50',
      compact ? 'py-3' : 'py-4',
    )}>
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', statusColor.bg)}>
        <StatusIcon className={cn('h-4.5 w-4.5', statusColor.text)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{m.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{m.playbookName?.replace(/-/g, ' ')}</span>
          <span>·</span>
          <span>{m.workItems.filter(w => w.status === 'completed').length}/{m.workItems.length} stages</span>
          {m.outcome && (
            <>
              <span>·</span>
              <span className={cn(
                'font-medium',
                m.outcome.result === 'won' ? 'text-emerald-500' :
                m.outcome.result === 'lost' ? 'text-red-500' :
                'text-muted-foreground'
              )}>
                {m.outcome.result.toUpperCase()}
              </span>
            </>
          )}
        </div>
      </div>
      {!compact && (
        <div className="flex items-center gap-3">
          <ProgressRing progress={m.progress} size={32} />
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      )}
    </button>
  );
}

function WorkItemCard({ item, isLast, onApprove, onSkip, loading, missionDetail }: {
  item: WorkItem; isLast: boolean; onApprove: (recipientEmail?: string) => void; onSkip: () => void; loading: boolean;
  missionDetail: Record<string, unknown> | null;
}) {
  const [showOutput, setShowOutput] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const StatusIcon = statusIcon(item.status);
  const colors = statusColorClass(item.status);
  const output = safeJSON(item.output);
  const hasOutput = output && Object.keys(output).length > 0;
  const isEmailItem = item.executorType === 'email';

  const detailWorkItems = (missionDetail as { workItems?: WorkItem[] } | null)?.workItems;
  const detailItem = detailWorkItems?.find((w: WorkItem) => w.id === item.id);
  const fullOutput = detailItem ? safeJSON((detailItem as unknown as { output: string }).output) : output;

  return (
    <div className="flex gap-4">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2', colors.border, colors.bg)}>
          <StatusIcon className={cn('h-4 w-4', colors.text)} />
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-border" />}
      </div>

      {/* Content */}
      <div className={cn('flex-1 pb-6', isLast && 'pb-0')}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">{item.stageName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ExecutorIcon type={item.executorType} className="h-3.5 w-3.5" />
              <span>{item.executorType}</span>
              {item.durationMs && <span>· {(item.durationMs / 1000).toFixed(1)}s</span>}
              {item.approvalRequired && item.status !== 'waiting_approval' && (
                <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-amber-500" /> approval required</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {item.status === 'waiting_approval' && !isEmailItem && (
              <>
                <button
                  onClick={() => onApprove()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  onClick={onSkip}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
                >
                  <SkipForward className="h-3.5 w-3.5" /> Skip
                </button>
              </>
            )}
            {hasOutput && (
              <button
                onClick={() => setShowOutput(!showOutput)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Eye className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'View'}
              </button>
            )}
          </div>
        </div>

        {/* Email approval with send */}
        {item.status === 'waiting_approval' && isEmailItem && (
          <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="mb-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
              Review the email draft below, then approve & send or approve without sending.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
                placeholder="Recipient email address"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <button
                onClick={() => onApprove(recipientEmail || undefined)}
                disabled={loading || !recipientEmail}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> Approve & Send
              </button>
              <button
                onClick={() => onApprove()}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/80 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve Only
              </button>
              <button
                onClick={onSkip}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
              >
                <SkipForward className="h-3.5 w-3.5" /> Skip
              </button>
            </div>
          </div>
        )}

        {/* Output preview */}
        {showOutput && fullOutput && (
          <div className="mt-3 rounded-xl border border-border bg-background p-4">
            <OutputRenderer data={fullOutput} executorType={item.executorType} />
          </div>
        )}
      </div>
    </div>
  );
}

function OutputRenderer({ data, executorType }: { data: Record<string, unknown>; executorType: string }) {
  if (executorType === 'email') {
    const channels = (data.channels || []) as Array<{ channel: string; subject?: string; body: string }>;
    return (
      <div className="space-y-4">
        {channels.map((ch, i) => (
          <div key={i}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{ch.channel}</p>
            {ch.subject && <p className="mb-1 text-sm font-medium text-foreground">Subject: {ch.subject}</p>}
            <p className="whitespace-pre-wrap text-sm text-foreground/80">{ch.body}</p>
          </div>
        ))}
      </div>
    );
  }

  if (executorType === 'proposal') {
    const proposal = data.proposal as Record<string, string> | undefined;
    if (!proposal) return <JsonPreview data={data} />;
    return (
      <div className="space-y-3">
        {Object.entries(proposal).map(([key, val]) => (
          <div key={key}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
            <p className="whitespace-pre-wrap text-sm text-foreground/80">{String(val)}</p>
          </div>
        ))}
      </div>
    );
  }

  if (executorType === 'meeting') {
    const agenda = data.agenda as { title?: string; sections?: Array<{ name: string; duration: string; notes?: string; questions?: string[]; talkingPoints?: string[] }> } | undefined;
    if (!agenda) return <JsonPreview data={data} />;
    return (
      <div className="space-y-3">
        {agenda.title && <p className="text-sm font-semibold text-foreground">{agenda.title}</p>}
        {agenda.sections?.map((s, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{s.name}</p>
              <span className="text-xs text-muted-foreground">{s.duration}</span>
            </div>
            {s.notes && <p className="mt-1 text-xs text-muted-foreground">{s.notes}</p>}
            {s.questions && (
              <ul className="mt-2 space-y-1">
                {s.questions.map((q, j) => <li key={j} className="text-xs text-foreground/80">• {q}</li>)}
              </ul>
            )}
            {s.talkingPoints && (
              <ul className="mt-2 space-y-1">
                {s.talkingPoints.map((t, j) => <li key={j} className="text-xs text-foreground/80">• {t}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (executorType === 'crm') {
    const tasks = (data.tasks || []) as Array<{ title: string; type: string; priority: string; dueInDays: number }>;
    const opp = data.opportunity as { title: string; estimatedValue: number; probability: number; stage: string } | undefined;
    return (
      <div className="space-y-3">
        {opp && (
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opportunity</p>
            <p className="mt-1 text-sm font-medium text-foreground">{opp.title}</p>
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              <span>Value: {formatCurrency(opp.estimatedValue)}</span>
              <span>Probability: {opp.probability}%</span>
            </div>
          </div>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tasks ({tasks.length})</p>
          {tasks.map((t, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg py-1.5 text-xs text-foreground/80">
              <span className={cn(
                'rounded px-1.5 py-0.5 font-medium',
                t.priority === 'high' ? 'bg-red-500/10 text-red-500' : 'bg-muted text-muted-foreground'
              )}>{t.priority}</span>
              {t.title}
              <span className="ml-auto text-muted-foreground">Due in {t.dueInDays}d</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <JsonPreview data={data} />;
}

function JsonPreview({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="max-h-60 overflow-auto text-xs text-muted-foreground">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function OutcomeCard({ outcome }: { outcome: Outcome }) {
  const resultColor = outcome.result === 'won' ? 'text-emerald-500 bg-emerald-500/10' :
                      outcome.result === 'lost' ? 'text-red-500 bg-red-500/10' :
                      'text-muted-foreground bg-muted';
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center gap-3">
        <Award className="h-5 w-5 text-foreground" />
        <span className="text-sm font-semibold text-foreground">Outcome</span>
        <span className={cn('rounded-lg px-2.5 py-1 text-xs font-semibold uppercase', resultColor)}>
          {outcome.result}
        </span>
        {outcome.revenue && (
          <span className="ml-auto text-sm font-semibold text-emerald-500">{formatCurrency(outcome.revenue)}</span>
        )}
      </div>
      {outcome.reason && <p className="mt-2 text-sm text-muted-foreground">{outcome.reason}</p>}
    </div>
  );
}

function PlaybookCard({ playbook: pb }: { playbook: Playbook }) {
  const metrics = pb.metrics || {};
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{pb.displayName}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{pb.description}</p>
        </div>
        <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">v{pb.version}</span>
      </div>

      {/* Stages */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pb.stages.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              <ExecutorIcon type={s.executorType} className="h-3 w-3" />
              {s.name}
              {s.approvalRequired && <Shield className="h-3 w-3 text-amber-500" />}
            </div>
            {i < pb.stages.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Metrics */}
      {(metrics.totalRuns as number) > 0 && (
        <div className="flex gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>{metrics.totalRuns as number} runs</span>
          <span>{metrics.conversionRate as number}% conversion</span>
          {(metrics.totalRevenue as number) > 0 && <span>{formatCurrency(metrics.totalRevenue as number)} revenue</span>}
        </div>
      )}
    </div>
  );
}

function ProgressRing({ progress, size = 32 }: { progress: number; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={2.5} className="stroke-muted" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={2.5}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        className={progress >= 100 ? 'stroke-emerald-500' : 'stroke-foreground'}
      />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        className="fill-foreground text-[8px] font-semibold rotate-90" style={{ transformOrigin: 'center' }}>
        {progress}%
      </text>
    </svg>
  );
}

function ExecutorIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case 'proposal': return <FileText className={className} />;
    case 'email': return <Mail className={className} />;
    case 'meeting': return <Users className={className} />;
    case 'crm': return <Briefcase className={className} />;
    default: return <Zap className={className} />;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'completed': return CheckCircle2;
    case 'running': case 'executing': return Play;
    case 'waiting_approval': case 'awaiting_approval': return Pause;
    case 'failed': return XCircle;
    case 'skipped': return SkipForward;
    case 'pending': return Clock;
    default: return Clock;
  }
}

function statusColorClass(status: string) {
  switch (status) {
    case 'completed': return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30' };
    case 'running': case 'executing': return { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30' };
    case 'waiting_approval': case 'awaiting_approval': return { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30' };
    case 'failed': return { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/30' };
    case 'skipped': return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
    default: return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' };
  }
}

function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

function safeJSON(str: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}
