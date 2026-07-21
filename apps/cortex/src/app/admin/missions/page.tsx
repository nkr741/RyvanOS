"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Zap,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Target,
  Bot,
  Shield,
  Activity,
  Loader2,
  AlertTriangle,
  X,
  Search,
  Users,
  Building2,
  MapPin,
  BarChart3,
  Sun,
  Brain,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface MissionStep {
  id: string;
  agentId: string;
  sequence: number;
  title: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  approvalRequired: boolean;
  error: string | null;
}

interface Mission {
  id: string;
  title: string;
  type: string;
  status: string;
  progress: number;
  merchant: { id: string; name: string } | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  steps: MissionStep[];
  currentStep: MissionStep | null;
  totalSteps: number;
  completedSteps: number;
}

interface MissionType {
  type: string;
  description: string;
}

interface MissionDetail {
  id: string;
  title: string;
  type: string;
  status: string;
  progress: number;
  config: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  merchant: { id: string; businessName: string; ownerName: string; leadStatus: string } | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  steps: {
    id: string;
    agentId: string;
    sequence: number;
    title: string;
    status: string;
    output: Record<string, unknown> | null;
    reasoning: string | null;
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
    durationMs: number | null;
    approvalRequired: boolean;
    approvedBy: string | null;
    approvedAt: string | null;
  }[];
  events: {
    id: string;
    type: string;
    source: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }[];
}

interface MerchantOption {
  id: string;
  businessName: string;
  leadStatus: string;
}

// ─── Output Renderer ───────────────────────────────────────────

function formatKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/Id$/, "")
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (Number.isInteger(value)) return value.toLocaleString("en-IN");
    return value.toFixed(1);
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    }
    return value;
  }
  return String(value);
}

const SKIP_KEYS = new Set(["reasoning", "eventsToPublish", "missionConfig", "previousOutput"]);
const HIGHLIGHT_KEYS = new Set(["businessName", "companyName", "score", "grade", "health", "healthStatus", "status", "created", "totalActive", "stalledCount", "healthy", "stalled", "atRisk"]);

function StepOutputView({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k]) => !SKIP_KEYS.has(k));
  const highlights = entries.filter(([k, v]) => HIGHLIGHT_KEYS.has(k) && typeof v !== "object");
  const details = entries.filter(([k]) => !HIGHLIGHT_KEYS.has(k));

  return (
    <div className="space-y-[var(--space-2)]">
      {highlights.length > 0 && (
        <div className="flex flex-wrap gap-[var(--space-2)]">
          {highlights.map(([k, v]) => (
            <div key={k} className="rounded-[var(--radius)] bg-[var(--primary)]/5 px-[var(--space-2)] py-[var(--space-1)]">
              <span className="text-[10px] text-[var(--muted-foreground)]">{formatKey(k)}</span>
              <span className="ml-[var(--space-1)] text-[var(--text-xs)] font-semibold text-[var(--foreground)]">{formatValue(v)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-[var(--space-1)]">
        {details.map(([k, v]) => {
          if (Array.isArray(v)) {
            if (v.length === 0) return null;
            return (
              <div key={k}>
                <p className="text-[10px] font-medium text-[var(--muted-foreground)]">{formatKey(k)} ({v.length})</p>
                <div className="mt-[var(--space-1)] max-h-32 space-y-[var(--space-1)] overflow-y-auto">
                  {v.slice(0, 8).map((item, i) => (
                    <div key={i} className="rounded-[var(--radius-sm)] bg-[var(--muted)] px-[var(--space-2)] py-[var(--space-1)] text-[10px] text-[var(--foreground)]">
                      {typeof item === "object" && item !== null
                        ? Object.entries(item as Record<string, unknown>)
                            .filter(([ik]) => !SKIP_KEYS.has(ik))
                            .map(([ik, iv]) => (
                              <span key={ik} className="mr-[var(--space-2)]">
                                <span className="text-[var(--muted-foreground)]">{formatKey(ik)}:</span>{" "}
                                <span className="font-medium">{formatValue(iv)}</span>
                              </span>
                            ))
                        : formatValue(item)
                      }
                    </div>
                  ))}
                  {v.length > 8 && (
                    <p className="text-[10px] text-[var(--muted-foreground)]">+{v.length - 8} more</p>
                  )}
                </div>
              </div>
            );
          }
          if (typeof v === "object" && v !== null) {
            return (
              <div key={k}>
                <p className="text-[10px] font-medium text-[var(--muted-foreground)]">{formatKey(k)}</p>
                <div className="mt-[var(--space-1)] rounded-[var(--radius-sm)] bg-[var(--muted)] px-[var(--space-2)] py-[var(--space-1)]">
                  {Object.entries(v as Record<string, unknown>)
                    .filter(([sk]) => !SKIP_KEYS.has(sk))
                    .map(([sk, sv]) => (
                      <div key={sk} className="flex items-center justify-between py-0.5 text-[10px]">
                        <span className="text-[var(--muted-foreground)]">{formatKey(sk)}</span>
                        <span className="font-medium text-[var(--foreground)]">{typeof sv === "object" ? JSON.stringify(sv) : formatValue(sv)}</span>
                      </div>
                    ))}
                </div>
              </div>
            );
          }
          return (
            <div key={k} className="flex items-center justify-between text-[10px]">
              <span className="text-[var(--muted-foreground)]">{formatKey(k)}</span>
              <span className="font-medium text-[var(--foreground)]">{formatValue(v)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function getToken(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("token") || "";
  }
  return "";
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

const STATUS_STYLES: Record<string, string> = {
  planning: "bg-blue-500/10 text-blue-500",
  executing: "bg-amber-500/10 text-amber-500",
  awaiting_approval: "bg-purple-500/10 text-purple-500",
  completed: "bg-emerald-500/10 text-emerald-500",
  failed: "bg-red-500/10 text-red-500",
  cancelled: "bg-zinc-500/10 text-zinc-500",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  planning: Clock,
  executing: Loader2,
  awaiting_approval: Pause,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: X,
};

const STEP_STATUS_STYLES: Record<string, string> = {
  pending: "bg-zinc-500/10 text-zinc-400",
  running: "bg-amber-500/10 text-amber-500",
  completed: "bg-emerald-500/10 text-emerald-500",
  failed: "bg-red-500/10 text-red-500",
  awaiting_approval: "bg-purple-500/10 text-purple-500",
  skipped: "bg-zinc-500/10 text-zinc-400",
};

const MISSION_TYPE_ICONS: Record<string, React.ElementType> = {
  merchant_acquisition: Target,
  follow_up_campaign: Users,
  territory_blitz: MapPin,
  pipeline_review: BarChart3,
  morning_briefing: Sun,
};

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Page ───────────────────────────────────────────────────────

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [types, setTypes] = useState<MissionType[]>([]);
  const [awaitingApproval, setAwaitingApproval] = useState(0);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [showLaunch, setShowLaunch] = useState(false);
  const [selectedMission, setSelectedMission] = useState<MissionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState("");

  // Launch form
  const [launchType, setLaunchType] = useState("");
  const [launchTitle, setLaunchTitle] = useState("");
  const [launchMerchantId, setLaunchMerchantId] = useState("");
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [merchantSearch, setMerchantSearch] = useState("");

  useEffect(() => {
    loadMissions();
    loadMerchants();
    const interval = setInterval(loadMissions, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadMissions() {
    try {
      const res = await fetch("/api/missions", { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setMissions(data.missions);
        setTypes(data.types);
        setAwaitingApproval(data.awaitingApproval);
      }
    } catch {
      setError("Failed to load missions");
    } finally {
      setLoading(false);
    }
  }

  async function loadMerchants() {
    try {
      const res = await fetch("/api/pipeline?view=board", { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        const all: MerchantOption[] = [];
        for (const [status, items] of Object.entries(data.columns)) {
          for (const item of items as Array<Record<string, unknown>>) {
            all.push({
              id: item.id as string,
              businessName: item.businessName as string,
              leadStatus: status,
            });
          }
        }
        setMerchants(all);
      }
    } catch (err) { console.error("[admin/missions] Failed to fetch merchant list", err); }
  }

  async function launchMission() {
    if (!launchType) return;
    setLaunching(true);
    setError("");
    try {
      const config: Record<string, unknown> = {};
      if (launchMerchantId) config.merchantId = launchMerchantId;

      const res = await fetch("/api/missions", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          title: launchTitle || undefined,
          type: launchType,
          config,
        }),
      });

      if (res.ok) {
        setShowLaunch(false);
        setLaunchType("");
        setLaunchTitle("");
        setLaunchMerchantId("");
        await loadMissions();
      } else {
        setError("Failed to launch mission");
      }
    } catch {
      setError("Failed to launch mission");
    } finally {
      setLaunching(false);
    }
  }

  async function loadMissionDetail(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/missions/${id}`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setSelectedMission(data);
      }
    } catch {
      setError("Failed to load mission details");
    } finally {
      setDetailLoading(false);
    }
  }

  async function missionAction(id: string, action: string, extra?: Record<string, unknown>) {
    setError("");
    try {
      const res = await fetch(`/api/missions/${id}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) setError("Action failed");
      await loadMissions();
      if (selectedMission?.id === id) {
        await loadMissionDetail(id);
      }
    } catch {
      setError("Action failed");
    }
  }

  const filtered = filter === "all"
    ? missions
    : missions.filter(m => m.status === filter);

  const activeMissions = missions.filter(m => m.status === "executing").length;
  const completedMissions = missions.filter(m => m.status === "completed").length;
  const failedMissions = missions.filter(m => m.status === "failed").length;

  const needsMerchant = ["merchant_acquisition"].includes(launchType);
  const filteredMerchants = merchantSearch
    ? merchants.filter(m => m.businessName.toLowerCase().includes(merchantSearch.toLowerCase()))
    : merchants;

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--space-6)]">
      {error && (
        <div className="flex items-center justify-between rounded-[var(--radius)] border border-red-200 bg-red-50 px-[var(--space-4)] py-[var(--space-3)] dark:border-red-900 dark:bg-red-950">
          <div className="flex items-center gap-[var(--space-2)]">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <span className="text-[var(--text-sm)] text-red-700 dark:text-red-300">{error}</span>
          </div>
          <button onClick={() => setError("")} className="text-red-600 hover:text-red-800 dark:text-red-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[var(--text-2xl)] font-bold text-[var(--foreground)]">
            Mission Command
          </h1>
          <p className="mt-[var(--space-1)] text-[var(--text-sm)] text-[var(--muted-foreground)]">
            Cortex Autonomous Operations
          </p>
        </div>
        <button
          onClick={() => setShowLaunch(true)}
          className="flex items-center gap-[var(--space-2)] rounded-[var(--radius)] bg-[var(--foreground)] px-[var(--space-4)] py-[var(--space-2)] text-[var(--text-sm)] font-medium text-[color:var(--background)] transition-opacity hover:opacity-90"
        >
          <Zap className="h-4 w-4" />
          Launch Mission
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-[var(--space-4)] lg:grid-cols-4">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-[var(--space-4)]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-xs)] font-medium text-[var(--muted-foreground)]">Active</span>
            <Activity className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-[var(--space-1)] text-[var(--text-2xl)] font-bold text-[var(--foreground)]">{activeMissions}</p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-[var(--space-4)]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-xs)] font-medium text-[var(--muted-foreground)]">Completed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-[var(--space-1)] text-[var(--text-2xl)] font-bold text-[var(--foreground)]">{completedMissions}</p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-[var(--space-4)]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-xs)] font-medium text-[var(--muted-foreground)]">Approvals</span>
            <Shield className="h-4 w-4 text-purple-500" />
          </div>
          <p className="mt-[var(--space-1)] text-[var(--text-2xl)] font-bold text-[var(--foreground)]">{awaitingApproval}</p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-[var(--space-4)]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-xs)] font-medium text-[var(--muted-foreground)]">Failed</span>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <p className="mt-[var(--space-1)] text-[var(--text-2xl)] font-bold text-[var(--foreground)]">{failedMissions}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-[var(--space-2)] overflow-x-auto">
        {["all", "executing", "awaiting_approval", "completed", "failed"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-[var(--radius)] px-[var(--space-3)] py-[var(--space-1)] text-[var(--text-xs)] font-medium transition-colors",
              filter === f
                ? "bg-[var(--foreground)] text-[color:var(--background)]"
                : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
            )}
          >
            {f === "all" ? "All" : f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Mission List */}
      <div className="space-y-[var(--space-3)]">
        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-[var(--space-12)] text-center">
            <Zap className="mx-auto h-10 w-10 text-[var(--muted-foreground)]" />
            <p className="mt-[var(--space-3)] text-[var(--text-sm)] font-medium text-[var(--foreground)]">
              No missions yet
            </p>
            <p className="mt-[var(--space-1)] text-[var(--text-xs)] text-[var(--muted-foreground)]">
              Launch your first autonomous mission
            </p>
          </div>
        ) : (
          filtered.map(mission => (
            <MissionCard
              key={mission.id}
              mission={mission}
              onClick={() => loadMissionDetail(mission.id)}
              onRetry={() => missionAction(mission.id, "retry")}
              onCancel={() => missionAction(mission.id, "cancel")}
            />
          ))
        )}
      </div>

      {/* Launch Modal */}
      {showLaunch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-[var(--space-4)] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--space-6)]">
            <div className="mb-[var(--space-5)] flex items-center justify-between">
              <div className="flex items-center gap-[var(--space-3)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius)] bg-[var(--foreground)]">
                  <Zap className="h-5 w-5 text-[color:var(--background)]" />
                </div>
                <div>
                  <h2 className="text-[var(--text-lg)] font-semibold text-[var(--foreground)]">Launch Mission</h2>
                  <p className="text-[var(--text-xs)] text-[var(--muted-foreground)]">Select a mission type to begin</p>
                </div>
              </div>
              <button onClick={() => setShowLaunch(false)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-[var(--space-4)]">
              {/* Mission Type Selection */}
              <div className="space-y-[var(--space-2)]">
                <label className="text-[var(--text-xs)] font-medium text-[var(--muted-foreground)]">Mission Type</label>
                <div className="grid grid-cols-1 gap-[var(--space-2)]">
                  {types.map(t => {
                    const Icon = MISSION_TYPE_ICONS[t.type] || Brain;
                    return (
                      <button
                        key={t.type}
                        onClick={() => setLaunchType(t.type)}
                        className={cn(
                          "flex items-center gap-[var(--space-3)] rounded-[var(--radius)] border p-[var(--space-3)] text-left transition-colors",
                          launchType === t.type
                            ? "border-[var(--foreground)] bg-[var(--foreground)]/5"
                            : "border-[var(--border)] hover:border-[var(--muted-foreground)]",
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0 text-[var(--muted-foreground)]" />
                        <div>
                          <p className="text-[var(--text-sm)] font-medium text-[var(--foreground)]">
                            {t.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </p>
                          <p className="text-[var(--text-xs)] text-[var(--muted-foreground)]">{t.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="text-[var(--text-xs)] font-medium text-[var(--muted-foreground)]">Title (optional)</label>
                <input
                  value={launchTitle}
                  onChange={e => setLaunchTitle(e.target.value)}
                  placeholder="Auto-generated if empty"
                  className="mt-[var(--space-1)] w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-sm)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                />
              </div>

              {/* Merchant Selection (for acquisition) */}
              {needsMerchant && (
                <div>
                  <label className="text-[var(--text-xs)] font-medium text-[var(--muted-foreground)]">Target Merchant</label>
                  <div className="relative mt-[var(--space-1)]">
                    <Search className="absolute left-[var(--space-3)] top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                    <input
                      value={merchantSearch}
                      onChange={e => setMerchantSearch(e.target.value)}
                      placeholder="Search merchants..."
                      className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] py-[var(--space-2)] pl-[var(--space-8)] pr-[var(--space-3)] text-[var(--text-sm)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                    />
                  </div>
                  <div className="mt-[var(--space-2)] max-h-40 space-y-[var(--space-1)] overflow-y-auto">
                    {filteredMerchants.slice(0, 8).map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setLaunchMerchantId(m.id); setMerchantSearch(m.businessName); }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-[var(--radius)] px-[var(--space-3)] py-[var(--space-2)] text-left text-[var(--text-sm)] transition-colors",
                          launchMerchantId === m.id
                            ? "bg-[var(--foreground)]/10 text-[var(--foreground)]"
                            : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                        )}
                      >
                        <span className="flex items-center gap-[var(--space-2)]">
                          <Building2 className="h-3.5 w-3.5" />
                          {m.businessName}
                        </span>
                        <span className="text-[var(--text-xs)] capitalize">{m.leadStatus.replace(/_/g, " ")}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={launchMission}
                disabled={!launchType || launching || (needsMerchant && !launchMerchantId)}
                className="mt-[var(--space-2)] flex w-full items-center justify-center gap-[var(--space-2)] rounded-[var(--radius)] bg-[var(--foreground)] px-[var(--space-4)] py-[var(--space-2)] text-[var(--text-sm)] font-medium text-[color:var(--background)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {launching ? "Launching..." : "Launch Mission"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mission Detail Modal */}
      {(selectedMission || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-[var(--space-4)] h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--space-6)]">
            {detailLoading && !selectedMission ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--muted-foreground)]" />
              </div>
            ) : selectedMission ? (
              <MissionDetailView
                mission={selectedMission}
                onClose={() => setSelectedMission(null)}
                onApprove={(stepId) => missionAction(selectedMission.id, "approve", { stepId })}
                onDeny={(stepId) => missionAction(selectedMission.id, "deny", { stepId, reason: "Denied by admin" })}
                onRetry={() => missionAction(selectedMission.id, "retry")}
                onCancel={() => missionAction(selectedMission.id, "cancel")}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mission Card ───────────────────────────────────────────────

function MissionCard({
  mission,
  onClick,
  onRetry,
  onCancel,
}: {
  mission: Mission;
  onClick: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const StatusIcon = STATUS_ICONS[mission.status] || Clock;
  const TypeIcon = MISSION_TYPE_ICONS[mission.type] || Brain;
  const isActive = mission.status === "executing";

  return (
    <div
      className={cn(
        "group cursor-pointer rounded-[var(--radius)] border bg-[var(--card)] p-[var(--space-4)] transition-all hover:border-[var(--muted-foreground)]",
        mission.status === "awaiting_approval"
          ? "border-purple-500/30"
          : mission.status === "failed"
            ? "border-red-500/20"
            : "border-[var(--border)]",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-[var(--space-3)]">
          <div className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)]",
            STATUS_STYLES[mission.status] || "bg-zinc-500/10",
          )}>
            <TypeIcon className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-[var(--text-sm)] font-semibold text-[var(--foreground)]">
              {mission.title}
            </h3>
            <div className="mt-[var(--space-1)] flex flex-wrap items-center gap-[var(--space-2)]">
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-[var(--space-2)] py-0.5 text-[10px] font-medium",
                STATUS_STYLES[mission.status],
              )}>
                <StatusIcon className={cn("h-3 w-3", isActive && "animate-spin")} />
                {mission.status.replace(/_/g, " ")}
              </span>
              {mission.merchant && (
                <span className="text-[var(--text-xs)] text-[var(--muted-foreground)]">
                  {mission.merchant.name}
                </span>
              )}
              <span className="text-[var(--text-xs)] text-[var(--muted-foreground)]">
                {timeAgo(mission.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-[var(--space-2)]">
          {mission.status === "failed" && (
            <button
              onClick={e => { e.stopPropagation(); onRetry(); }}
              className="rounded-[var(--radius)] p-[var(--space-1)] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Retry"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          {["executing", "awaiting_approval", "planning"].includes(mission.status) && (
            <button
              onClick={e => { e.stopPropagation(); onCancel(); }}
              className="rounded-[var(--radius)] p-[var(--space-1)] text-[var(--muted-foreground)] transition-colors hover:bg-red-500/10 hover:text-red-500"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)]" />
        </div>
      </div>

      {/* Progress Bar */}
      {mission.progress > 0 && mission.progress < 100 && (
        <div className="mt-[var(--space-3)]">
          <div className="flex items-center justify-between text-[var(--text-xs)]">
            <span className="text-[var(--muted-foreground)]">
              Step {mission.completedSteps}/{mission.totalSteps}
              {mission.currentStep && ` — ${mission.currentStep.title}`}
            </span>
            <span className="font-medium text-[var(--foreground)]">{mission.progress}%</span>
          </div>
          <div className="mt-[var(--space-1)] h-1.5 rounded-full bg-[var(--muted)]">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                mission.status === "failed" ? "bg-red-500" : "bg-emerald-500",
              )}
              style={{ width: `${mission.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Step indicators */}
      <div className="mt-[var(--space-3)] flex gap-[var(--space-1)]">
        {mission.steps.map(step => (
          <div
            key={step.id}
            className={cn(
              "h-1 flex-1 rounded-full",
              STEP_STATUS_STYLES[step.status]?.replace("text-", "bg-").split(" ")[0] || "bg-zinc-500/20",
            )}
            title={`${step.title}: ${step.status}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Mission Detail View ────────────────────────────────────────

function MissionDetailView({
  mission,
  onClose,
  onApprove,
  onDeny,
  onRetry,
  onCancel,
}: {
  mission: MissionDetail;
  onClose: () => void;
  onApprove: (stepId: string) => void;
  onDeny: (stepId: string) => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [showEvents, setShowEvents] = useState(false);
  const StatusIcon = STATUS_ICONS[mission.status] || Clock;

  function toggleStep(id: string) {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[var(--text-lg)] font-bold text-[var(--foreground)]">{mission.title}</h2>
          <div className="mt-[var(--space-1)] flex items-center gap-[var(--space-2)]">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full px-[var(--space-2)] py-0.5 text-[var(--text-xs)] font-medium",
              STATUS_STYLES[mission.status],
            )}>
              <StatusIcon className="h-3 w-3" />
              {mission.status.replace(/_/g, " ")}
            </span>
            <span className="text-[var(--text-xs)] text-[var(--muted-foreground)]">
              {mission.progress}% complete
            </span>
            <span className="text-[var(--text-xs)] text-[var(--muted-foreground)]">
              {timeAgo(mission.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-[var(--space-2)]">
          {mission.status === "failed" && (
            <button onClick={onRetry} className="rounded-[var(--radius)] bg-amber-500/10 px-[var(--space-3)] py-[var(--space-1)] text-[var(--text-xs)] font-medium text-amber-500 hover:bg-amber-500/20">
              <RotateCcw className="mr-1 inline h-3 w-3" /> Retry
            </button>
          )}
          {["executing", "awaiting_approval"].includes(mission.status) && (
            <button onClick={onCancel} className="rounded-[var(--radius)] bg-red-500/10 px-[var(--space-3)] py-[var(--space-1)] text-[var(--text-xs)] font-medium text-red-500 hover:bg-red-500/20">
              Cancel
            </button>
          )}
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mission.error && (
        <div className="mt-[var(--space-3)] rounded-[var(--radius)] bg-red-500/10 p-[var(--space-3)] text-[var(--text-xs)] text-red-500">
          {mission.error}
        </div>
      )}

      {mission.merchant && (
        <div className="mt-[var(--space-3)] flex items-center gap-[var(--space-2)] rounded-[var(--radius)] bg-[var(--muted)] p-[var(--space-3)]">
          <Building2 className="h-4 w-4 text-[var(--muted-foreground)]" />
          <span className="text-[var(--text-sm)] font-medium text-[var(--foreground)]">{mission.merchant.businessName}</span>
          <span className="text-[var(--text-xs)] text-[var(--muted-foreground)]">{mission.merchant.ownerName}</span>
          <span className="ml-auto text-[var(--text-xs)] capitalize text-[var(--muted-foreground)]">
            {mission.merchant.leadStatus.replace(/_/g, " ")}
          </span>
        </div>
      )}

      {/* Steps */}
      <div className="mt-[var(--space-5)]">
        <h3 className="mb-[var(--space-3)] flex items-center gap-[var(--space-2)] text-[var(--text-sm)] font-semibold text-[var(--foreground)]">
          <Bot className="h-4 w-4" /> Execution Steps
        </h3>
        <div className="space-y-[var(--space-2)]">
          {mission.steps.map(step => {
            const expanded = expandedSteps.has(step.id);
            return (
              <div key={step.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)]">
                <button
                  onClick={() => toggleStep(step.id)}
                  className="flex w-full items-center gap-[var(--space-3)] p-[var(--space-3)] text-left"
                >
                  <span className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    STEP_STATUS_STYLES[step.status],
                  )}>
                    {step.status === "completed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : step.status === "running" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : step.status === "failed" ? (
                      <XCircle className="h-3.5 w-3.5" />
                    ) : step.status === "awaiting_approval" ? (
                      <Shield className="h-3.5 w-3.5" />
                    ) : (
                      step.sequence
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[var(--text-sm)] font-medium text-[var(--foreground)]">{step.title}</p>
                    <p className="text-[var(--text-xs)] text-[var(--muted-foreground)]">
                      {step.agentId}
                      {step.durationMs !== null && ` · ${step.durationMs}ms`}
                    </p>
                  </div>
                  {step.status === "awaiting_approval" && (
                    <div className="flex gap-[var(--space-1)]" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => onApprove(step.id)}
                        className="rounded-[var(--radius)] bg-emerald-500/10 px-[var(--space-2)] py-[var(--space-1)] text-[10px] font-medium text-emerald-500 hover:bg-emerald-500/20"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => onDeny(step.id)}
                        className="rounded-[var(--radius)] bg-red-500/10 px-[var(--space-2)] py-[var(--space-1)] text-[10px] font-medium text-red-500 hover:bg-red-500/20"
                      >
                        Deny
                      </button>
                    </div>
                  )}
                  {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" /> : <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />}
                </button>

                {expanded && (
                  <div className="border-t border-[var(--border)] p-[var(--space-3)]">
                    {step.error && (
                      <div className="mb-[var(--space-2)] rounded-[var(--radius)] bg-red-500/10 p-[var(--space-2)] text-[var(--text-xs)] text-red-500">
                        {step.error}
                      </div>
                    )}
                    {step.reasoning && (
                      <div className="mb-[var(--space-2)]">
                        <p className="mb-[var(--space-1)] text-[10px] font-medium text-[var(--muted-foreground)]">REASONING LOG</p>
                        <pre className="whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--muted)] p-[var(--space-2)] font-mono text-[10px] text-[var(--foreground)]">
                          {step.reasoning}
                        </pre>
                      </div>
                    )}
                    {step.output && (
                      <div>
                        <p className="mb-[var(--space-1)] text-[10px] font-medium text-[var(--muted-foreground)]">OUTPUT</p>
                        <StepOutputView data={step.output} />
                      </div>
                    )}
                    {step.approvedBy && (
                      <p className="mt-[var(--space-2)] text-[var(--text-xs)] text-[var(--muted-foreground)]">
                        Approved by {step.approvedBy} {step.approvedAt && `at ${new Date(step.approvedAt).toLocaleString("en-IN")}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Event Log */}
      <div className="mt-[var(--space-5)]">
        <button
          onClick={() => setShowEvents(!showEvents)}
          className="flex items-center gap-[var(--space-2)] text-[var(--text-sm)] font-semibold text-[var(--foreground)]"
        >
          <Activity className="h-4 w-4" />
          Event Log ({mission.events.length})
          {showEvents ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {showEvents && (
          <div className="mt-[var(--space-2)] max-h-60 space-y-[var(--space-1)] overflow-y-auto">
            {mission.events.map(evt => (
              <div key={evt.id} className="flex items-start gap-[var(--space-2)] rounded-[var(--radius)] bg-[var(--muted)] p-[var(--space-2)]">
                <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--muted-foreground)]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-medium text-[var(--foreground)]">{evt.type}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">{new Date(evt.createdAt).toLocaleTimeString("en-IN")}</span>
                  </div>
                  <span className="text-[10px] text-[var(--muted-foreground)]">source: {evt.source}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
