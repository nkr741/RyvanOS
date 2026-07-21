'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Network, RefreshCw, ChevronRight, Globe, Zap,
  Layers, Building2, Code, Cloud, Users, Award,
  TrendingUp, AlertTriangle, Lightbulb, Target,
  BarChart3, ArrowUpRight, Database, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface GraphNode {
  id: string;
  type: string;
  name: string;
  metadata: Record<string, unknown>;
  confidence: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  strength: number;
  evidence: string | null;
}

interface EcosystemInsight {
  id: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  recommendation: string | null;
  recommendedService: string | null;
  prospectIds: string[];
}

interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  totalInsights: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
}

interface Prospect {
  id: string;
  companyName: string;
  industry: string | null;
  qualificationGrade: string | null;
}

const NODE_ICONS: Record<string, React.ElementType> = {
  company: Building2,
  technology: Code,
  cloud_provider: Cloud,
  vendor: Globe,
  person: Users,
  partner: Network,
  industry: TrendingUp,
  certification: Award,
  service: Target,
};

const NODE_COLORS: Record<string, string> = {
  company: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  technology: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  cloud_provider: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  vendor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  person: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  partner: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
  industry: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  certification: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  service: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

const EDGE_LABELS: Record<string, string> = {
  uses: 'uses',
  partners_with: 'partners with',
  hires_for: 'hiring',
  located_in: 'located in',
  certified_in: 'certified in',
  competes_with: 'competes with',
  vendors_with: 'vendor',
  industry_of: 'industry',
  provides_service: 'needs service',
};

export default function RelationshipIntelligencePage() {
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<string | null>(null);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [insights, setInsights] = useState<EcosystemInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [activeTab, setActiveTab] = useState<'graph' | 'insights' | 'ecosystem'>('graph');

  const getToken = useCallback(() => localStorage.getItem('token') || '', []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/growth/relationships?view=stats', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats);
    } catch (err) { console.error("[admin/relationships] Failed to fetch relationship stats", err); }
  }, [getToken]);

  const fetchProspects = useCallback(async () => {
    try {
      const res = await fetch('/api/growth/discovery?view=prospects', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setProspects(data.prospects || []);
    } catch (err) { console.error("[admin/relationships] Failed to fetch prospects", err); }
  }, [getToken]);

  const fetchGraph = useCallback(async (prospectId: string) => {
    try {
      const res = await fetch(`/api/growth/relationships?view=graph&prospectId=${prospectId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setGraph(data.graph);
    } catch (err) { console.error("[admin/relationships] Failed to fetch relationship graph", err); }
  }, [getToken]);

  const fetchInsights = useCallback(async (prospectId?: string) => {
    try {
      const url = prospectId
        ? `/api/growth/relationships?view=insights&prospectId=${prospectId}`
        : '/api/growth/relationships?view=insights';
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) return;
      const data = await res.json();
      setInsights(data.insights || []);
    } catch (err) { console.error("[admin/relationships] Failed to fetch ecosystem insights", err); }
  }, [getToken]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchProspects(), fetchInsights()]).finally(() => setLoading(false));
  }, [fetchStats, fetchProspects, fetchInsights]);

  useEffect(() => {
    if (selectedProspect) {
      fetchGraph(selectedProspect);
      fetchInsights(selectedProspect);
    }
  }, [selectedProspect, fetchGraph, fetchInsights]);

  const buildAllGraphs = async () => {
    setBuilding(true);
    try {
      const res = await fetch('/api/growth/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ action: 'build_all' }),
      });
      if (res.ok) {
        await fetchStats();
        if (selectedProspect) await fetchGraph(selectedProspect);
        await fetchInsights();
      }
    } catch (err) { console.error("[admin/relationships] Failed to build relationship graphs", err); }
    finally { setBuilding(false); }
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
          <h2 className="text-xl font-semibold text-foreground">Relationship Intelligence</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Understanding ecosystems, not isolated companies
          </p>
        </div>
        <button
          onClick={buildAllGraphs}
          disabled={building}
          className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {building ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> Building...</>
          ) : (
            <><Network className="h-4 w-4" /> Build All Graphs</>
          )}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Database} label="Graph Nodes" value={stats.totalNodes} color="text-blue-500" />
          <StatCard icon={Network} label="Connections" value={stats.totalEdges} color="text-violet-500" />
          <StatCard icon={Lightbulb} label="Ecosystem Insights" value={stats.totalInsights} color="text-amber-500" />
          <StatCard icon={Building2} label="Companies Mapped" value={stats.nodesByType.company || 0} color="text-emerald-500" />
        </div>
      )}

      {/* Node Distribution */}
      {stats && stats.totalNodes > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-foreground">Knowledge Graph Distribution</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.nodesByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const Icon = NODE_ICONS[type] || Database;
              return (
                <div key={type} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2', NODE_COLORS[type] || 'bg-muted text-foreground border-border')}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium capitalize">{type.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Prospect List */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">Prospects</h3>
            </div>
            <div className="max-h-[calc(100vh-24rem)] overflow-y-auto">
              {prospects.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No prospects yet.
                </div>
              ) : (
                prospects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProspect(p.id); setGraph(null); }}
                    className={cn(
                      'flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/50',
                      selectedProspect === p.id && 'bg-muted/80'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{p.companyName}</p>
                      <span className="text-xs text-muted-foreground">{p.industry || 'Unknown'}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Graph & Insights */}
        <div className="lg:col-span-9">
          {!selectedProspect ? (
            <div className="space-y-4">
              {/* Global ecosystem insights when no prospect selected */}
              {insights.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    <h3 className="text-sm font-semibold text-foreground">Ecosystem Insights</h3>
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      {insights.length} patterns
                    </span>
                  </div>
                  <div className="space-y-3">
                    {insights.map(insight => (
                      <InsightCard key={insight.id} insight={insight} />
                    ))}
                  </div>
                </div>
              )}

              {insights.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-24">
                  <Network className="h-12 w-12 text-muted-foreground/40" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Select a prospect or click &ldquo;Build All Graphs&rdquo; to generate the knowledge graph
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tab Bar */}
              <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
                {(['graph', 'insights', 'ecosystem'] as const).map(tab => (
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
                    {tab === 'graph' && 'Knowledge Graph'}
                    {tab === 'insights' && 'Ecosystem Insights'}
                    {tab === 'ecosystem' && 'Connection Map'}
                  </button>
                ))}
              </div>

              {activeTab === 'graph' && graph && (
                <GraphView nodes={graph.nodes} edges={graph.edges} />
              )}

              {activeTab === 'graph' && !graph && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20">
                  <Database className="h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">No graph data yet. Click &ldquo;Build All Graphs&rdquo; to generate.</p>
                </div>
              )}

              {activeTab === 'insights' && (
                <div className="space-y-3">
                  {insights.length > 0 ? (
                    insights.map(i => <InsightCard key={i.id} insight={i} />)
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                      No ecosystem insights for this prospect yet.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'ecosystem' && graph && (
                <ConnectionMap nodes={graph.nodes} edges={graph.edges} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function GraphView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const companyNode = nodes.find(n => n.type === 'company');
  const groupedNodes = nodes.reduce<Record<string, GraphNode[]>>((acc, n) => {
    if (n.type === 'company') return acc;
    (acc[n.type] = acc[n.type] || []).push(n);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Company Hub */}
      {companyNode && (
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Building2 className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{companyNode.name}</h3>
              <p className="text-xs text-muted-foreground">
                {nodes.length - 1} connected entities &middot; {edges.length} relationships
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grouped Connections */}
      {Object.entries(groupedNodes).sort((a, b) => b[1].length - a[1].length).map(([type, typeNodes]) => {
        const Icon = NODE_ICONS[type] || Database;
        const colorClass = NODE_COLORS[type] || 'bg-muted text-foreground border-border';

        return (
          <div key={type} className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon className={cn('h-4 w-4', colorClass.split(' ')[1])} />
              <h4 className="text-sm font-semibold capitalize text-foreground">{type.replace(/_/g, ' ')}</h4>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {typeNodes.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {typeNodes.map(node => {
                const nodeEdges = edges.filter(e => e.source === node.id || e.target === node.id);
                const edgeType = nodeEdges[0]?.type;
                const strength = nodeEdges[0]?.strength || 0;

                return (
                  <div
                    key={node.id}
                    className={cn('group relative flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors', colorClass)}
                  >
                    <span className="text-xs font-medium">{node.name}</span>
                    <span className="text-[10px] opacity-60">{strength}%</span>
                    {edgeType && nodeEdges[0]?.evidence && (
                      <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-[10px] text-background shadow-lg group-hover:block">
                        {nodeEdges[0].evidence.slice(0, 80)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConnectionMap({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const companyNode = nodes.find(n => n.type === 'company');
  if (!companyNode) return null;

  const connections = edges
    .filter(e => e.source === companyNode.id)
    .map(e => {
      const target = nodes.find(n => n.id === e.target);
      return target ? { ...e, targetNode: target } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b!.strength - a!.strength);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Connection Map — {companyNode.name}</h3>
      <div className="space-y-2">
        {connections.map(conn => {
          if (!conn) return null;
          const Icon = NODE_ICONS[conn.targetNode.type] || Database;
          const label = EDGE_LABELS[conn.type] || conn.type;

          return (
            <div key={conn.id} className="flex items-center gap-3 rounded-xl bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 text-blue-500" />
                <span className="font-medium text-foreground">{companyNode.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-px w-6 bg-border" />
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{label}</span>
                <div className="h-px w-6 bg-border" />
                <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2">
                <Icon className={cn('h-3.5 w-3.5', (NODE_COLORS[conn.targetNode.type] || '').split(' ')[1] || 'text-muted-foreground')} />
                <span className="text-xs font-medium text-foreground">{conn.targetNode.name}</span>
                <span className="text-[10px] text-muted-foreground">{conn.strength}%</span>
              </div>
              {conn.evidence && (
                <span className="ml-auto truncate text-[10px] italic text-muted-foreground max-w-[200px]">
                  &ldquo;{conn.evidence}&rdquo;
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: EcosystemInsight }) {
  const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
    cluster: { icon: Layers, color: 'text-violet-500' },
    pattern: { icon: BarChart3, color: 'text-blue-500' },
    opportunity: { icon: Target, color: 'text-emerald-500' },
    risk: { icon: AlertTriangle, color: 'text-red-500' },
    cross_sell: { icon: Zap, color: 'text-amber-500' },
  };

  const config = typeConfig[insight.type] || { icon: Lightbulb, color: 'text-muted-foreground' };
  const Icon = config.icon;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-foreground">{insight.title}</h4>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
              {insight.type}
            </span>
            <span className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-bold',
              insight.confidence >= 80 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
              insight.confidence >= 60 ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
              'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}>
              {insight.confidence}%
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{insight.description}</p>
          {insight.recommendation && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-emerald-500/5 px-3 py-2">
              <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
              <p className="text-xs text-emerald-700 dark:text-emerald-400">{insight.recommendation}</p>
            </div>
          )}
          {insight.recommendedService && (
            <div className="mt-2 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {insight.recommendedService}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
