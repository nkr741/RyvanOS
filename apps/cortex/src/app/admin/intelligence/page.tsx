'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Brain, RefreshCw, ChevronRight, ChevronDown, Shield,
  Zap, Target, AlertTriangle, TrendingUp, Users, Layers,
  FileText, Eye, Clock, CheckCircle2, Star, ArrowUpRight,
  Lightbulb, MessageSquare, BookOpen, Activity, Database,
  Globe, Code, Building2, Lock, BarChart3, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Section {
  id: string;
  type: string;
  title: string;
  content: Record<string, unknown>;
  confidence: number;
  freshness: number;
  evidenceCount: number;
}

interface Insight {
  id: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  importance: string;
  derivedFrom: string[];
  evidence: string | null;
  recommendation: string | null;
  recommendedService: string | null;
}

interface Signal {
  id: string;
  type: string;
  value: string;
  confidence: number;
  importance: string;
  evidence: string | null;
}

interface MeetingBrief {
  objective: string;
  questions: string[];
  likelyObjections: Array<{ objection: string; response: string }>;
  suggestedServices: string[];
  expectedBudgetRange: string;
  competitors: string[];
  nextBestAction: string;
  followUpStrategy: string;
}

interface Intelligence {
  id: string;
  version: number;
  status: string;
  overallConfidence: number | null;
  overallFreshness: number;
  triggeringEvent: string | null;
  createdAt: string;
  publishedAt: string | null;
  meetingBrief: MeetingBrief | null;
  sections: Section[];
  insights: Insight[];
  prospect: {
    id: string;
    companyName: string;
    signals: Signal[];
  };
}

interface Prospect {
  id: string;
  companyName: string;
  industry: string | null;
  size: string | null;
  qualificationScore: number | null;
  qualificationGrade: string | null;
  status: string;
}

const SECTION_ICONS: Record<string, React.ElementType> = {
  executive_summary: FileText,
  technology: Code,
  business: TrendingUp,
  people: Users,
  relationships: Globe,
  pain_analysis: AlertTriangle,
  recommendations: Lightbulb,
  risks: Shield,
  competitive: Target,
};

const SECTION_COLORS: Record<string, string> = {
  executive_summary: 'text-blue-500',
  technology: 'text-violet-500',
  business: 'text-emerald-500',
  people: 'text-amber-500',
  relationships: 'text-cyan-500',
  pain_analysis: 'text-red-500',
  recommendations: 'text-yellow-500',
  risks: 'text-orange-500',
  competitive: 'text-pink-500',
};

export default function AccountIntelligencePage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'intelligence' | 'meeting' | 'evidence'>('intelligence');

  const getToken = useCallback(() => localStorage.getItem('token') || '', []);

  const fetchProspects = useCallback(async () => {
    try {
      const res = await fetch('/api/growth/discovery?view=prospects', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setProspects(data.prospects || []);
    } catch (err) { console.error("[admin/intelligence] Failed to fetch prospect list", err); }
  }, [getToken]);

  const fetchIntelligence = useCallback(async (prospectId: string) => {
    try {
      const res = await fetch(`/api/growth/intelligence?view=latest&prospectId=${prospectId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setIntelligence(data.intelligence || null);
      if (data.intelligence) {
        setExpandedSections(new Set(data.intelligence.sections.map((s: Section) => s.type)));
      }
    } catch (err) { console.error("[admin/intelligence] Failed to fetch intelligence data", err); }
  }, [getToken]);

  useEffect(() => {
    setLoading(true);
    fetchProspects().finally(() => setLoading(false));
  }, [fetchProspects]);

  useEffect(() => {
    if (selectedProspect) fetchIntelligence(selectedProspect);
  }, [selectedProspect, fetchIntelligence]);

  const generateIntelligence = async (prospectId: string) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/growth/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ action: 'generate', prospectId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.intelligence) {
        setIntelligence(data.intelligence);
        setExpandedSections(new Set(data.intelligence.sections.map((s: Section) => s.type)));
      }
    } catch (err) { console.error("[admin/intelligence] Failed to generate intelligence", err); }
    finally { setGenerating(false); }
  };

  const toggleSection = (type: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Account Intelligence Engine</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Explainable intelligence from market signals — not guesswork
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {prospects.length} Prospects
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Prospect List — Left Panel */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Prospects</h3>
            </div>
            <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
              {prospects.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No prospects yet. Promote candidates from Discovery Hub.
                </div>
              ) : (
                prospects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProspect(p.id); setIntelligence(null); }}
                    className={cn(
                      'flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50',
                      selectedProspect === p.id && 'bg-muted/80'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{p.companyName}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {p.industry && (
                          <span className="text-xs text-muted-foreground">{p.industry}</span>
                        )}
                        {p.qualificationGrade && (
                          <span className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-bold',
                            p.qualificationGrade === 'A' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                            p.qualificationGrade === 'B' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                            p.qualificationGrade === 'C' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                            p.qualificationGrade === 'D' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                          )}>
                            {p.qualificationGrade}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Intelligence — Right Panel */}
        <div className="lg:col-span-9">
          {!selectedProspect ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24">
              <Brain className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-4 text-sm text-muted-foreground">Select a prospect to view intelligence</p>
            </div>
          ) : !intelligence ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24">
              <Database className="h-12 w-12 text-muted-foreground/40" />
              <p className="mt-4 text-sm font-medium text-foreground">No intelligence generated yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Generate account intelligence from collected signals</p>
              <button
                onClick={() => generateIntelligence(selectedProspect)}
                disabled={generating}
                className="mt-4 flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {generating ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Generating...</>
                ) : (
                  <><Zap className="h-4 w-4" /> Generate Intelligence</>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Intelligence Header */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {intelligence.prospect.companyName}
                    </h3>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" /> v{intelligence.version}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" /> {intelligence.status}
                      </span>
                      {intelligence.publishedAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {new Date(intelligence.publishedAt).toLocaleDateString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Activity className="h-3 w-3" /> {intelligence.sections.length} sections
                      </span>
                      <span className="flex items-center gap-1">
                        <Lightbulb className="h-3 w-3" /> {intelligence.insights.length} insights
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ConfidenceMeter value={intelligence.overallConfidence || 0} />
                    <button
                      onClick={() => generateIntelligence(selectedProspect!)}
                      disabled={generating}
                      className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', generating && 'animate-spin')} />
                      Refresh
                    </button>
                  </div>
                </div>

                {/* Tab Bar */}
                <div className="mt-4 flex gap-1 rounded-xl bg-muted/50 p-1">
                  {(['intelligence', 'meeting', 'evidence'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                        activeTab === tab
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {tab === 'intelligence' && 'Intelligence'}
                      {tab === 'meeting' && 'Meeting Copilot'}
                      {tab === 'evidence' && 'Evidence Graph'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'intelligence' && (
                <IntelligenceTab
                  sections={intelligence.sections}
                  insights={intelligence.insights}
                  expandedSections={expandedSections}
                  toggleSection={toggleSection}
                />
              )}

              {activeTab === 'meeting' && intelligence.meetingBrief && (
                <MeetingCopilotTab brief={intelligence.meetingBrief} companyName={intelligence.prospect.companyName} />
              )}

              {activeTab === 'evidence' && (
                <EvidenceTab signals={intelligence.prospect.signals} insights={intelligence.insights} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 80 ? 'text-emerald-500' : value >= 60 ? 'text-blue-500' : value >= 40 ? 'text-amber-500' : 'text-red-500';
  const bg = value >= 80 ? 'bg-emerald-500' : value >= 60 ? 'bg-blue-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', bg)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn('text-sm font-semibold', color)}>{value}%</span>
    </div>
  );
}

function IntelligenceTab({
  sections, insights, expandedSections, toggleSection,
}: {
  sections: Section[];
  insights: Insight[];
  expandedSections: Set<string>;
  toggleSection: (type: string) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Insights Bar */}
      {insights.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h4 className="text-sm font-semibold text-foreground">Inference Engine Insights</h4>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              {insights.length} insights
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {insights.map(insight => (
              <div key={insight.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{insight.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{insight.description}</p>
                  </div>
                  <span className={cn(
                    'ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold',
                    insight.importance === 'critical' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                    insight.importance === 'high' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                    insight.importance === 'medium' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                  )}>
                    {insight.confidence}%
                  </span>
                </div>
                {insight.recommendedService && (
                  <div className="mt-2 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {insight.recommendedService}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.map(section => {
        const Icon = SECTION_ICONS[section.type] || FileText;
        const iconColor = SECTION_COLORS[section.type] || 'text-muted-foreground';
        const expanded = expandedSections.has(section.type);

        return (
          <div key={section.id} className="rounded-2xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => toggleSection(section.type)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/30"
            >
              <Icon className={cn('h-5 w-5 shrink-0', iconColor)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{section.title}</p>
              </div>
              <div className="flex items-center gap-3">
                {section.evidenceCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <BookOpen className="h-3 w-3" /> {section.evidenceCount} evidence
                  </span>
                )}
                <ConfidenceMeter value={section.confidence} />
                {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {expanded && (
              <div className="border-t border-border px-5 py-4">
                <SectionContent type={section.type} content={section.content} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionContent({ type, content }: { type: string; content: Record<string, unknown> }) {
  switch (type) {
    case 'executive_summary': {
      const c = content as { summary: string; signalCount: number; topSignals: string[] };
      return (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-foreground">{c.summary}</p>
          {c.topSignals?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {c.topSignals.map((s, i) => (
                <span key={i} className="rounded-lg bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'technology': {
      const c = content as { cloud: string; techStack: string[]; categories: Record<string, string[]>; evidenceItems: Array<{ signal: string; evidence: string; confidence: number }> };
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Cloud:</span>
            <span className="rounded-lg bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-600 dark:text-violet-400">{c.cloud}</span>
          </div>
          {c.categories && Object.entries(c.categories).filter(([, v]) => v.length > 0).map(([cat, techs]) => (
            <div key={cat}>
              <p className="mb-1 text-xs font-medium capitalize text-muted-foreground">{cat}</p>
              <div className="flex flex-wrap gap-1.5">
                {techs.map((t, i) => (
                  <span key={i} className="rounded-lg bg-muted px-2.5 py-1 text-xs text-foreground">{t}</span>
                ))}
              </div>
            </div>
          ))}
          {c.evidenceItems?.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Evidence</p>
              {c.evidenceItems.map((e, i) => (
                <div key={i} className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{e.signal}:</span> {e.evidence}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'business': {
      const c = content as { growthSignals: string[]; hiringActivity: Array<{ role: string; evidence: string | null }> };
      return (
        <div className="space-y-3">
          {c.growthSignals?.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Growth Signals</p>
              <div className="flex flex-wrap gap-1.5">
                {c.growthSignals.map((s, i) => (
                  <span key={i} className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">{s}</span>
                ))}
              </div>
            </div>
          )}
          {c.hiringActivity?.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Hiring Activity</p>
              {c.hiringActivity.map((h, i) => (
                <div key={i} className="mb-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="font-medium text-foreground">{h.role}</span>
                  {h.evidence && <span className="text-muted-foreground"> — {h.evidence}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'pain_analysis': {
      const c = content as { painPoints: string[]; evidenceItems: Array<{ pain: string; evidence: string | null; confidence: number }> };
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {c.painPoints?.map((p, i) => (
              <span key={i} className="rounded-lg bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400">{p}</span>
            ))}
          </div>
          {c.evidenceItems?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Evidence</p>
              {c.evidenceItems.map((e, i) => (
                <div key={i} className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{e.pain}</span> ({e.confidence}%)
                  {e.evidence && <span> — {e.evidence}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'recommendations': {
      const c = content as { recommendations: Array<{ insight: string; service: string | null; confidence: number }>; recommendedServices: string[] };
      return (
        <div className="space-y-3">
          {c.recommendedServices?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {c.recommendedServices.map((s, i) => (
                <span key={i} className="rounded-lg bg-yellow-500/10 px-2.5 py-1 text-xs font-bold text-yellow-600 dark:text-yellow-400">{s}</span>
              ))}
            </div>
          )}
          {c.recommendations?.map((r, i) => (
            <div key={i} className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-sm text-foreground">{r.insight}</p>
              <div className="mt-1.5 flex items-center gap-2">
                {r.service && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{r.service}</span>}
                <span className="text-xs text-muted-foreground">{r.confidence}% confidence</span>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case 'risks': {
      const c = content as { risks: Array<{ risk: string; severity: string; mitigation: string }> };
      return (
        <div className="space-y-2">
          {c.risks?.map((r, i) => (
            <div key={i} className="rounded-lg border border-border px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  r.severity === 'high' ? 'text-red-500' : r.severity === 'medium' ? 'text-amber-500' : 'text-blue-500'
                )} />
                <div>
                  <p className="text-sm font-medium text-foreground">{r.risk}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.mitigation}</p>
                </div>
              </div>
            </div>
          ))}
          {(!c.risks || c.risks.length === 0) && (
            <p className="text-sm text-muted-foreground">No significant risks identified.</p>
          )}
        </div>
      );
    }
    case 'people': {
      const c = content as { knownRoles: Array<{ title: string; evidence: string | null }>; contactStrategy: string };
      return (
        <div className="space-y-3">
          {c.knownRoles?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {c.knownRoles.map((r, i) => (
                <span key={i} className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">{r.title}</span>
              ))}
            </div>
          )}
          {c.contactStrategy && (
            <p className="text-sm text-muted-foreground">{c.contactStrategy}</p>
          )}
        </div>
      );
    }
    case 'relationships': {
      const c = content as { relationships: Array<{ type: string; entity: string; evidence: string | null }> };
      return (
        <div className="space-y-2">
          {c.relationships?.map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <span className="font-medium text-muted-foreground">{r.type}:</span>
              <span className="text-foreground">{r.entity}</span>
              {r.evidence && <span className="text-muted-foreground">— {r.evidence}</span>}
            </div>
          )) }
          {(!c.relationships || c.relationships.length === 0) && (
            <p className="text-sm text-muted-foreground">No relationship signals detected.</p>
          )}
        </div>
      );
    }
    case 'competitive': {
      const c = content as { possibleVendors: string[]; differentiators: string[] };
      return (
        <div className="space-y-3">
          {c.possibleVendors?.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Possible Competing Vendors</p>
              <div className="flex flex-wrap gap-1.5">
                {c.possibleVendors.map((v, i) => (
                  <span key={i} className="rounded-lg bg-pink-500/10 px-2.5 py-1 text-xs text-pink-600 dark:text-pink-400">{v}</span>
                ))}
              </div>
            </div>
          )}
          {c.differentiators?.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Ryvan Differentiators</p>
              <div className="flex flex-wrap gap-1.5">
                {c.differentiators.map((d, i) => (
                  <span key={i} className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400">{d}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    default:
      return <pre className="text-xs text-muted-foreground overflow-x-auto">{JSON.stringify(content, null, 2)}</pre>;
  }
}

function MeetingCopilotTab({ brief, companyName }: { brief: MeetingBrief; companyName: string }) {
  return (
    <div className="space-y-4">
      {/* Objective */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-500" />
          <h4 className="text-sm font-semibold text-foreground">Meeting Objective</h4>
        </div>
        <p className="text-sm leading-relaxed text-foreground">{brief.objective}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Budget range:</span>
          <span className="rounded-lg bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {brief.expectedBudgetRange}
          </span>
        </div>
      </div>

      {/* Discovery Questions */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-violet-500" />
          <h4 className="text-sm font-semibold text-foreground">Discovery Questions</h4>
        </div>
        <div className="space-y-2">
          {brief.questions.map((q, i) => (
            <div key={i} className="flex gap-3 rounded-xl bg-muted/30 px-4 py-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-[10px] font-bold text-violet-600 dark:text-violet-400">
                {i + 1}
              </span>
              <p className="text-sm text-foreground">{q}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Objection Handling */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-500" />
          <h4 className="text-sm font-semibold text-foreground">Objection Handling</h4>
        </div>
        <div className="space-y-3">
          {brief.likelyObjections.map((o, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                &ldquo;{o.objection}&rdquo;
              </p>
              <p className="mt-2 text-sm text-foreground">{o.response}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Next Best Action */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-emerald-500" />
          <h4 className="text-sm font-semibold text-foreground">Next Best Action</h4>
        </div>
        <p className="text-sm font-medium text-foreground">{brief.nextBestAction}</p>
        <p className="mt-2 text-sm text-muted-foreground">{brief.followUpStrategy}</p>
        {brief.suggestedServices.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {brief.suggestedServices.map((s, i) => (
              <span key={i} className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EvidenceTab({ signals, insights }: { signals: Signal[]; insights: Insight[] }) {
  const signalsWithEvidence = signals.filter(s => s.evidence);
  const signalsByType = signals.reduce<Record<string, Signal[]>>((acc, s) => {
    (acc[s.type] = acc[s.type] || []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Evidence Chain */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-blue-500" />
          <h4 className="text-sm font-semibold text-foreground">Evidence Chain</h4>
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
            {signals.length} signals → {insights.length} insights
          </span>
        </div>

        <div className="flex items-center justify-center gap-2 rounded-xl bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <span className="rounded-lg bg-blue-500/10 px-2 py-1 font-medium text-blue-600 dark:text-blue-400">
            {signals.length} Signals
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="rounded-lg bg-amber-500/10 px-2 py-1 font-medium text-amber-600 dark:text-amber-400">
            {insights.length} Insights
          </span>
          <ChevronRight className="h-3 w-3" />
          <span className="rounded-lg bg-emerald-500/10 px-2 py-1 font-medium text-emerald-600 dark:text-emerald-400">
            Recommendations
          </span>
        </div>
      </div>

      {/* Signals by Type */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h4 className="mb-3 text-sm font-semibold text-foreground">Signals by Type</h4>
        <div className="space-y-4">
          {Object.entries(signalsByType).map(([type, sigs]) => (
            <div key={type}>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium capitalize text-foreground">{type}</span>
                <span className="text-[10px] text-muted-foreground">{sigs.length} signals</span>
              </div>
              <div className="space-y-1">
                {sigs.map(s => (
                  <div key={s.id} className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs">
                    <span className={cn(
                      'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      s.importance === 'critical' ? 'bg-red-500' : s.importance === 'high' ? 'bg-amber-500' : 'bg-blue-500'
                    )} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground">{s.value}</span>
                      <span className="ml-2 text-muted-foreground">{s.confidence}%</span>
                      {s.evidence && (
                        <p className="mt-0.5 text-muted-foreground italic">&ldquo;{s.evidence}&rdquo;</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Evidence Coverage */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h4 className="mb-3 text-sm font-semibold text-foreground">Evidence Coverage</h4>
        <div className="flex items-center gap-4 text-sm">
          <div>
            <span className="text-2xl font-bold text-foreground">{signalsWithEvidence.length}</span>
            <span className="ml-1 text-muted-foreground">/ {signals.length} signals have evidence</span>
          </div>
          <ConfidenceMeter value={signals.length > 0 ? Math.round((signalsWithEvidence.length / signals.length) * 100) : 0} />
        </div>
      </div>
    </div>
  );
}
