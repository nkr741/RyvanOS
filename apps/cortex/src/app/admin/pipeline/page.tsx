"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Building2,
  TrendingUp,
  Target,
  IndianRupee,
  Search,
  ChevronDown,
  Clock,
  ArrowRight,
  Loader2,
  AlertCircle,
  BarChart3,
  User,
  X,
  EyeOff,
  Eye,
  MoveRight,
  Check,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

/* ---------- Types ---------- */

interface BDE {
  id: string;
  name: string;
}

interface SurveyCard {
  id: string;
  businessName: string;
  ownerName: string;
  mobile: string;
  category: string;
  leadScore: number | null;
  leadStatus: string;
  interestLevel: string | null;
  potentialRevenue: number | null;
  stageChangedAt: string | null;
  createdAt: string;
  bde: { id: string; name: string } | null;
}

interface BoardData {
  columns: Record<string, SurveyCard[]>;
  bdes: BDE[];
  total: number;
}

interface StatsData {
  stageCounts: Record<string, number>;
  totalRevenue: number;
  totalActive: number;
  conversionRate: number;
  recentTransitions: TransitionRecord[];
}

interface TransitionRecord {
  id: string;
  fromStage: string;
  toStage: string;
  notes: string | null;
  createdAt: string;
  survey: { id: string; businessName: string };
  user: { id: string; name: string };
}

/* ---------- Constants ---------- */

const PIPELINE_STAGES = [
  {
    key: "new",
    label: "Lead",
    color: "bg-blue-500",
    textColor: "text-blue-600 dark:text-blue-400",
    lightBg: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  {
    key: "qualified",
    label: "Qualified",
    color: "bg-indigo-500",
    textColor: "text-indigo-600 dark:text-indigo-400",
    lightBg: "bg-indigo-500/10",
    borderColor: "border-indigo-500/30",
  },
  {
    key: "interested",
    label: "Interested",
    color: "bg-amber-500",
    textColor: "text-amber-600 dark:text-amber-400",
    lightBg: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  {
    key: "negotiation",
    label: "Negotiation",
    color: "bg-purple-500",
    textColor: "text-purple-600 dark:text-purple-400",
    lightBg: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
  },
  {
    key: "onboarded",
    label: "Onboarded",
    color: "bg-emerald-500",
    textColor: "text-emerald-600 dark:text-emerald-400",
    lightBg: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  {
    key: "active_merchant",
    label: "Active Merchant",
    color: "bg-green-500",
    textColor: "text-green-600 dark:text-green-400",
    lightBg: "bg-green-500/10",
    borderColor: "border-green-500/30",
  },
];

const LOST_STAGE = {
  key: "not_interested",
  label: "Lost",
  color: "bg-red-500",
  textColor: "text-red-600 dark:text-red-400",
  lightBg: "bg-red-500/10",
  borderColor: "border-red-500/30",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ["qualified", "not_interested"],
  qualified: ["interested", "new", "not_interested"],
  interested: ["negotiation", "qualified", "not_interested"],
  negotiation: ["onboarded", "interested", "not_interested"],
  onboarded: ["active_merchant", "negotiation"],
  active_merchant: ["onboarded"],
  follow_up: ["qualified", "interested", "negotiation", "not_interested"],
  not_interested: ["new", "qualified"],
};

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "restaurant", label: "Restaurant" },
  { value: "kirana", label: "Kirana" },
  { value: "supermarket", label: "Supermarket" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "bakery", label: "Bakery" },
  { value: "cafe", label: "Cafe" },
  { value: "fruits_vegetables", label: "Fruits & Vegetables" },
  { value: "meat_shop", label: "Meat Shop" },
  { value: "pet_shop", label: "Pet Shop" },
  { value: "electronics", label: "Electronics" },
  { value: "stationery", label: "Stationery" },
  { value: "flower_shop", label: "Flower Shop" },
  { value: "others", label: "Others" },
];

/* ---------- Helpers ---------- */

function getToken(): string {
  return localStorage.getItem("token") || "";
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function daysInStage(
  stageChangedAt: string | null,
  createdAt: string
): string {
  const ref = stageChangedAt || createdAt;
  const days = Math.floor(
    (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function formatCategory(cat: string): string {
  return cat
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function dealHealthDot(stageChangedAt: string | null, createdAt: string, stage: string): string {
  if (stage === "active_merchant") return "bg-emerald-500";
  if (stage === "not_interested") return "bg-zinc-400";
  const ref = stageChangedAt || createdAt;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24));
  const thresholds: Record<string, number> = { new: 14, qualified: 10, interested: 14, negotiation: 21, onboarded: 30 };
  const threshold = thresholds[stage] ?? 14;
  if (days > threshold * 2) return "bg-red-500";
  if (days > threshold) return "bg-amber-500";
  return "bg-emerald-500";
}

function dealHealthLabel(stageChangedAt: string | null, createdAt: string, stage: string): string {
  if (stage === "active_merchant") return "Healthy — Active merchant";
  if (stage === "not_interested") return "Lost";
  const ref = stageChangedAt || createdAt;
  const days = Math.floor((Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24));
  const thresholds: Record<string, number> = { new: 14, qualified: 10, interested: 14, negotiation: 21, onboarded: 30 };
  const threshold = thresholds[stage] ?? 14;
  if (days > threshold * 2) return `At Risk — ${days} days in stage`;
  if (days > threshold) return `Stalled — ${days} days in stage`;
  return "Healthy";
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function stageLabel(key: string): string {
  const found = PIPELINE_STAGES.find((s) => s.key === key);
  if (found) return found.label;
  if (key === "not_interested") return "Lost";
  if (key === "follow_up") return "Follow-up";
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function leadScoreBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

/* ---------- Skeleton Components ---------- */

function MetricSkeleton() {
  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] p-[var(--space-5)]"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-[var(--space-2)]">
          <div className="h-3 w-20 animate-pulse rounded bg-[var(--muted)]" />
          <div className="h-7 w-24 animate-pulse rounded bg-[var(--muted)]" />
        </div>
        <div className="h-10 w-10 animate-pulse rounded-[var(--radius)] bg-[var(--muted)]" />
      </div>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <div
      className="flex min-w-[280px] flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/30"
      style={{ minHeight: 400 }}
    >
      <div className="border-b border-[var(--border)] p-[var(--space-3)]">
        <div className="h-4 w-20 animate-pulse rounded bg-[var(--muted)]" />
      </div>
      <div className="flex flex-col gap-[var(--space-2)] p-[var(--space-3)]">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-[var(--radius)] bg-[var(--muted)]"
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] p-[var(--space-5)] transition-shadow hover:shadow-[var(--shadow)]"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p
            className="text-[var(--text-xs)] font-medium uppercase tracking-wider text-[var(--muted-foreground)]"
            style={{ letterSpacing: "0.05em" }}
          >
            {label}
          </p>
          <p className="mt-[var(--space-1)] text-[var(--text-2xl)] font-semibold text-[var(--foreground)]">
            {value}
          </p>
        </div>
        <div className={cn("rounded-[var(--radius)] p-[var(--space-2)]", color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  );
}

/* ---------- Pipeline Card ---------- */

function PipelineCard({
  card,
  currentStage,
  onMove,
  isMoving,
}: {
  card: SurveyCard;
  currentStage: string;
  onMove: (surveyId: string, toStage: string, notes?: string) => void;
  isMoving: boolean;
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [moveNotes, setMoveNotes] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const transitions = VALID_TRANSITIONS[currentStage] || [];
  const allStages = [...PIPELINE_STAGES, LOST_STAGE];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoveMenu(false);
        setSelectedTarget(null);
        setMoveNotes("");
      }
    }
    if (showMoveMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMoveMenu]);

  const handleConfirmMove = () => {
    if (!selectedTarget) return;
    onMove(card.id, selectedTarget, moveNotes.trim() || undefined);
    setShowMoveMenu(false);
    setSelectedTarget(null);
    setMoveNotes("");
  };

  const score = card.leadScore ?? 0;

  return (
    <div
      className={cn(
        "group relative rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] p-[var(--space-3)] transition-[box-shadow] duration-[var(--transition-fast)]",
        "hover:shadow-[var(--shadow)]"
      )}
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {/* Business Name + Deal Health */}
      <div className="flex items-center gap-[var(--space-2)]">
        <span
          className={cn(
            "inline-block h-2 w-2 shrink-0 rounded-full",
            dealHealthDot(card.stageChangedAt, card.createdAt, currentStage)
          )}
          title={dealHealthLabel(card.stageChangedAt, card.createdAt, currentStage)}
        />
        <p className="truncate text-[var(--text-sm)] font-medium text-[var(--foreground)]">
          {card.businessName}
        </p>
      </div>

      {/* Owner + Category */}
      <div className="mt-[var(--space-1)] flex items-center gap-[var(--space-2)]">
        <span className="truncate text-[var(--text-xs)] text-[var(--muted-foreground)]">
          {card.ownerName}
        </span>
        <span className="inline-flex shrink-0 items-center rounded-[var(--radius-full)] bg-[var(--muted)] px-[var(--space-2)] py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
          {formatCategory(card.category)}
        </span>
      </div>

      {/* Lead Score Bar */}
      {card.leadScore !== null && (
        <div className="mt-[var(--space-2)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-[var(--muted-foreground)]">
              Lead Score
            </span>
            <span className="text-[10px] font-semibold text-[var(--foreground)]">
              {card.leadScore}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-[var(--radius-full)] bg-[var(--muted)]">
            <div
              className={cn(
                "h-full rounded-[var(--radius-full)] transition-all duration-500",
                leadScoreBarColor(score)
              )}
              style={{ width: `${Math.min(score, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* BDE + Days in stage */}
      <div className="mt-[var(--space-2)] flex items-center justify-between">
        {card.bde ? (
          <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
            <User className="h-3 w-3" />
            {card.bde.name}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--muted-foreground)]">
            Unassigned
          </span>
        )}
        <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
          <Clock className="h-3 w-3" />
          {daysInStage(card.stageChangedAt, card.createdAt)}
        </span>
      </div>

      {/* Potential Revenue */}
      {card.potentialRevenue !== null && card.potentialRevenue > 0 && (
        <div className="mt-[var(--space-2)] flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
          <IndianRupee className="h-3 w-3" />
          {formatCurrency(card.potentialRevenue)}
        </div>
      )}

      {/* Move Button */}
      {transitions.length > 0 && (
        <div className="relative mt-[var(--space-2)]" ref={menuRef}>
          <button
            onClick={() => setShowMoveMenu(!showMoveMenu)}
            disabled={isMoving}
            className={cn(
              "flex w-full items-center justify-center gap-[var(--space-1)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-[var(--space-2)] py-[var(--space-1)] text-[var(--text-xs)] font-medium text-[var(--muted-foreground)]",
              "transition-colors duration-[var(--transition-fast)]",
              "hover:border-[var(--primary)] hover:text-[var(--primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {isMoving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <MoveRight className="h-3 w-3" />
            )}
            Move
          </button>

          {/* Move Dropdown */}
          {showMoveMenu && (
            <div
              className="absolute bottom-full left-0 z-50 mb-[var(--space-1)] w-full min-w-[220px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)]"
              style={{ boxShadow: "var(--shadow-lg)" }}
            >
              <div className="border-b border-[var(--border)] px-[var(--space-3)] py-[var(--space-2)]">
                <p className="text-[var(--text-xs)] font-semibold text-[var(--foreground)]">
                  Move to stage
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto p-[var(--space-1)]">
                {transitions.map((t) => {
                  const targetStage = allStages.find((s) => s.key === t);
                  if (!targetStage) return null;
                  return (
                    <button
                      key={t}
                      onClick={() => setSelectedTarget(t)}
                      className={cn(
                        "flex w-full items-center gap-[var(--space-2)] rounded-[var(--radius)] px-[var(--space-2)] py-[var(--space-2)] text-left text-[var(--text-xs)] transition-colors",
                        selectedTarget === t
                          ? cn(targetStage.lightBg, targetStage.textColor)
                          : "text-[var(--foreground)] hover:bg-[var(--muted)]"
                      )}
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-[var(--radius-full)]",
                          targetStage.color
                        )}
                      />
                      {targetStage.label}
                      {selectedTarget === t && (
                        <Check className="ml-auto h-3 w-3" />
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedTarget && (
                <div className="border-t border-[var(--border)] p-[var(--space-2)]">
                  <textarea
                    placeholder="Add a note (optional)"
                    value={moveNotes}
                    onChange={(e) => setMoveNotes(e.target.value)}
                    rows={2}
                    className="mb-[var(--space-2)] w-full resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-[var(--space-2)] py-[var(--space-1)] text-[var(--text-xs)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-none"
                  />
                  <button
                    onClick={handleConfirmMove}
                    disabled={isMoving}
                    className="flex w-full items-center justify-center gap-[var(--space-1)] rounded-[var(--radius)] bg-[var(--primary)] px-[var(--space-3)] py-[var(--space-1)] text-[var(--text-xs)] font-medium text-[var(--primary-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {isMoving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Kanban Column ---------- */

function KanbanColumn({
  stage,
  cards,
  onMove,
  movingId,
}: {
  stage: (typeof PIPELINE_STAGES)[number] | typeof LOST_STAGE;
  cards: SurveyCard[];
  onMove: (surveyId: string, toStage: string, notes?: string) => void;
  movingId: string | null;
}) {
  return (
    <div className="flex min-w-[280px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20">
      {/* Colored top accent */}
      <div className={cn("h-[2px] w-full shrink-0", stage.color)} />

      {/* Column Header */}
      <div className="border-b border-[var(--border)] p-[var(--space-3)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-[var(--space-2)]">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-[var(--radius-full)]",
                stage.color
              )}
            />
            <span className="text-[var(--text-sm)] font-semibold text-[var(--foreground)]">
              {stage.label}
            </span>
          </div>
          <span
            className={cn(
              "inline-flex h-5 min-w-[20px] items-center justify-center rounded-[var(--radius-full)] px-[var(--space-1)] text-[10px] font-semibold",
              stage.lightBg,
              stage.textColor
            )}
          >
            {cards.length}
          </span>
        </div>
      </div>

      {/* Cards List */}
      <div
        className="flex flex-1 flex-col gap-[var(--space-2)] overflow-y-auto p-[var(--space-2)]"
        style={{ maxHeight: "calc(100vh - 340px)" }}
      >
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] px-[var(--space-3)] py-[var(--space-8)] text-center">
            <BarChart3 className="mb-[var(--space-2)] h-5 w-5 text-[var(--muted-foreground)]/50" />
            <p className="text-[var(--text-xs)] text-[var(--muted-foreground)]">
              No merchants
            </p>
          </div>
        ) : (
          cards.map((card) => (
            <PipelineCard
              key={card.id}
              card={card}
              currentStage={stage.key}
              onMove={onMove}
              isMoving={movingId === card.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Recent Activity ---------- */

function RecentActivity({
  transitions,
}: {
  transitions: TransitionRecord[];
}) {
  if (transitions.length === 0) return null;

  return (
    <div className="mt-[var(--space-6)]">
      <h3 className="mb-[var(--space-3)] text-[var(--text-sm)] font-semibold text-[var(--foreground)]">
        Recent Activity
      </h3>
      <div
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)]"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="divide-y divide-[var(--border)]">
          {transitions.slice(0, 10).map((t) => (
            <div
              key={t.id}
              className="flex items-start gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)]"
            >
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--primary-light)]">
                <ArrowRight className="h-3 w-3 text-[var(--primary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[var(--text-xs)] text-[var(--foreground)]">
                  <span className="font-medium">{t.user.name}</span>
                  {" moved "}
                  <span className="font-medium">{t.survey.businessName}</span>
                  {" from "}
                  <span className="font-medium">{stageLabel(t.fromStage)}</span>
                  {" "}
                  <ArrowRight className="inline h-3 w-3 text-[var(--muted-foreground)]" />
                  {" "}
                  <span className="font-medium">{stageLabel(t.toStage)}</span>
                </p>
                {t.notes && (
                  <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)] italic">
                    &ldquo;{t.notes}&rdquo;
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">
                {relativeTime(t.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function PipelinePage() {
  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [bdeFilter, setBdeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showLost, setShowLost] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchBoard = useCallback(async () => {
    try {
      const params = new URLSearchParams({ view: "board" });
      if (bdeFilter) params.set("bdeId", bdeFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/pipeline?${params.toString()}`, {
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      const data: BoardData = await res.json();
      setBoardData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline");
    }
  }, [bdeFilter, categoryFilter, debouncedSearch]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline?view=stats", {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      const data: StatsData = await res.json();
      setStatsData(data);
    } catch {
      // Stats are non-critical — board still works without them
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError("");
      await Promise.all([fetchBoard(), fetchStats()]);
      if (!cancelled) setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [fetchBoard, fetchStats]);

  const handleMove = async (
    surveyId: string,
    toStage: string,
    notes?: string
  ) => {
    setMovingId(surveyId);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ surveyId, toStage, notes }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || `Failed to move merchant (${res.status})`
        );
      }

      // Refresh data after successful move
      await Promise.all([fetchBoard(), fetchStats()]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to move merchant"
      );
    } finally {
      setMovingId(null);
    }
  };

  const lostCount = boardData?.columns?.["not_interested"]?.length ?? 0;

  /* ---------- Render ---------- */

  return (
    <div className="flex flex-col gap-[var(--space-6)] p-[var(--space-6)]">
      {/* Page Header */}
      <div>
        <h1 className="text-[var(--text-2xl)] font-bold text-[var(--foreground)]">
          Revenue Pipeline
        </h1>
        <p className="mt-[var(--space-1)] text-[var(--text-sm)] text-[var(--muted-foreground)]">
          Track merchants and revenue across every stage of the lifecycle
        </p>
      </div>

      {/* Metrics Bar */}
      {isLoading && !statsData ? (
        <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-4">
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
          <MetricSkeleton />
        </div>
      ) : statsData ? (
        <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Merchants"
            value={String(
              Object.values(statsData.stageCounts).reduce((a, b) => a + b, 0)
            )}
            icon={Building2}
            color="bg-blue-500"
          />
          <StatCard
            label="Active Pipeline"
            value={String(statsData.totalActive)}
            icon={TrendingUp}
            color="bg-emerald-500"
          />
          <StatCard
            label="Conversion Rate"
            value={`${statsData.conversionRate}%`}
            icon={Target}
            color="bg-purple-500"
          />
          <StatCard
            label="Pipeline Value"
            value={formatCurrency(statsData.totalRevenue)}
            icon={IndianRupee}
            color="bg-amber-500"
          />
        </div>
      ) : null}

      {/* Filter Bar */}
      <div
        className="flex flex-wrap items-center gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] p-[var(--space-3)]"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-[var(--space-3)] top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Search merchants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] py-[var(--space-2)] pl-[var(--space-8)] pr-[var(--space-3)] text-[var(--text-sm)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]",
              "transition-colors duration-[var(--transition-fast)]",
              "focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            )}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-[var(--space-2)] top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* BDE Filter */}
        <div className="relative">
          <select
            value={bdeFilter}
            onChange={(e) => setBdeFilter(e.target.value)}
            className={cn(
              "appearance-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] py-[var(--space-2)] pl-[var(--space-3)] pr-[var(--space-8)] text-[var(--text-sm)] text-[var(--foreground)]",
              "transition-colors duration-[var(--transition-fast)]",
              "focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            )}
          >
            <option value="">All BDEs</option>
            {boardData?.bdes.map((bde) => (
              <option key={bde.id} value={bde.id}>
                {bde.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-[var(--space-2)] top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        </div>

        {/* Category Filter */}
        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={cn(
              "appearance-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] py-[var(--space-2)] pl-[var(--space-3)] pr-[var(--space-8)] text-[var(--text-sm)] text-[var(--foreground)]",
              "transition-colors duration-[var(--transition-fast)]",
              "focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
            )}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-[var(--space-2)] top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        </div>

        {/* Lost Toggle */}
        <button
          onClick={() => setShowLost(!showLost)}
          className={cn(
            "flex items-center gap-[var(--space-1)] rounded-[var(--radius)] border px-[var(--space-3)] py-[var(--space-2)] text-[var(--text-sm)] font-medium transition-colors duration-[var(--transition-fast)]",
            showLost
              ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
              : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          )}
        >
          {showLost ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
          Lost
          {lostCount > 0 && (
            <span
              className={cn(
                "ml-[var(--space-1)] inline-flex h-5 min-w-[20px] items-center justify-center rounded-[var(--radius-full)] px-1 text-[10px] font-semibold",
                showLost
                  ? "bg-red-500/20 text-red-600 dark:text-red-400"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)]"
              )}
            >
              {lostCount}
            </span>
          )}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="flex items-center gap-[var(--space-2)] rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 px-[var(--space-4)] py-[var(--space-3)] text-[var(--text-sm)] text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>{error}</p>
          <button
            onClick={() => setError("")}
            className="ml-auto shrink-0 rounded p-0.5 hover:bg-red-500/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Kanban Board */}
      {isLoading && !boardData ? (
        <div className="flex gap-[var(--space-3)] overflow-x-auto pb-[var(--space-4)]">
          {PIPELINE_STAGES.map((s) => (
            <ColumnSkeleton key={s.key} />
          ))}
        </div>
      ) : boardData ? (
        <div className="-mx-[var(--space-6)] px-[var(--space-6)]">
          <div className="flex gap-[var(--space-3)] overflow-x-auto pb-[var(--space-4)]">
            {PIPELINE_STAGES.map((stage) => (
              <KanbanColumn
                key={stage.key}
                stage={stage}
                cards={boardData.columns[stage.key] || []}
                onMove={handleMove}
                movingId={movingId}
              />
            ))}

            {/* Lost Column */}
            {showLost && (
              <KanbanColumn
                stage={LOST_STAGE}
                cards={boardData.columns["not_interested"] || []}
                onMove={handleMove}
                movingId={movingId}
              />
            )}
          </div>
        </div>
      ) : null}

      {/* Recent Activity */}
      {statsData && statsData.recentTransitions.length > 0 && (
        <RecentActivity transitions={statsData.recentTransitions} />
      )}
    </div>
  );
}
