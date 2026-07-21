"use client";

import React, { useEffect, useState } from "react";
import {
  Sparkles, Copy, Check, CheckCircle2, ArrowRight, AlertTriangle,
  Clock, TrendingUp, MessageSquare, Target, Activity, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Factor { label: string; score: number; maxScore: number; reasoning: string }

interface AIInsightsData {
  opportunity: {
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    factors: Factor[];
    summary: string;
  };
  dealHealth: {
    status: "healthy" | "stalled" | "at_risk";
    score: number;
    reasons: string[];
    daysSinceActivity: number;
    daysInStage: number;
    recommendation: string;
  };
  prediction: {
    nextStage: string;
    nextStageLabel: string;
    probability: number;
    estimatedDays: number;
    confidence: "high" | "medium" | "low";
  } | null;
  suggestedOffer: {
    commissionRate: string;
    rationale: string;
    incentives: string[];
    urgency: "high" | "medium" | "low";
  };
  followUpMessage: string;
}

interface AIInsightsPanelProps { surveyId: string }

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-500", B: "text-blue-500", C: "text-amber-500",
  D: "text-orange-500", F: "text-red-500",
};
const GRADE_STROKES: Record<string, string> = {
  A: "#10b981", B: "#3b82f6", C: "#f59e0b", D: "#f97316", F: "#ef4444",
};
const HEALTH_CFG: Record<string, { label: string; color: string; dot: string }> = {
  healthy: { label: "Healthy", color: "text-emerald-500", dot: "bg-emerald-500" },
  stalled: { label: "Stalled", color: "text-amber-500", dot: "bg-amber-500" },
  at_risk: { label: "At Risk", color: "text-red-500", dot: "bg-red-500 animate-pulse" },
};
const LEVEL_BADGE: Record<string, string> = {
  high: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  low: "bg-red-500/10 text-red-500 border-red-500/20",
};
const URGENCY_BADGE: Record<string, string> = {
  high: "bg-red-500/10 text-red-500 border-red-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

function scoreTier(s: number) {
  return s >= 70 ? "text-emerald-500 bg-emerald-500/10"
    : s >= 40 ? "text-amber-500 bg-amber-500/10"
    : "text-red-500 bg-red-500/10";
}

function barColor(pct: number) {
  return pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444";
}

/* Section header used by every section */
const SH = "flex items-center gap-[var(--space-2)] text-[var(--text-xs)] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]";

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const sz = 88, sw = 7, r = (sz - sw) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="-rotate-90">
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={sw} />
        <circle
          cx={sz / 2} cy={sz / 2} r={r} fill="none"
          stroke={GRADE_STROKES[grade] ?? "var(--primary)"}
          strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (score / 100) * c}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.34,1.56,0.64,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-2xl font-bold leading-none", GRADE_COLORS[grade])}>{grade}</span>
        <span className="text-[var(--text-xs)] text-[var(--muted-foreground)] mt-0.5">{score}</span>
      </div>
    </div>
  );
}

function FactorBar({ f }: { f: Factor }) {
  const pct = Math.round((f.score / f.maxScore) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[var(--text-xs)]">
        <span className="text-[var(--foreground)] font-medium truncate mr-2">{f.label}</span>
        <span className="text-[var(--muted-foreground)] shrink-0">{f.score}/{f.maxScore}</span>
      </div>
      <div className="h-1.5 rounded-[var(--radius-full)] bg-[var(--muted)] overflow-hidden">
        <div
          className="h-full rounded-[var(--radius-full)] transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor(pct) }}
        />
      </div>
      <p className="text-[var(--text-xs)] text-[var(--muted-foreground)] leading-snug">{f.reasoning}</p>
    </div>
  );
}

function PanelSkeleton() {
  const bar = "skeleton rounded-[var(--radius-sm)]";
  return (
    <div className="space-y-[var(--space-5)] p-[var(--space-5)]">
      <div className="flex items-center gap-[var(--space-4)]">
        <div className="skeleton size-[88px] rounded-full shrink-0" />
        <div className="flex-1 space-y-[var(--space-2)]">
          <div className={cn(bar, "h-3 w-2/3")} />
          <div className={cn(bar, "h-3 w-full")} />
          <div className={cn(bar, "h-3 w-1/2")} />
        </div>
      </div>
      <div className="border-b border-[var(--border)]" />
      <div className="space-y-[var(--space-2)]">
        <div className={cn(bar, "h-4 w-1/3")} />
        <div className={cn(bar, "h-3 w-full")} />
        <div className={cn(bar, "h-3 w-3/4")} />
      </div>
      <div className="border-b border-[var(--border)]" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-[var(--space-2)]">
          <div className={cn(bar, "h-4 w-2/5")} />
          <div className={cn(bar, "h-3 w-full")} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AIInsightsPanel({ surveyId }: AIInsightsPanelProps) {
  const [data, setData] = useState<AIInsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/ai?type=merchant&id=${surveyId}`);
        if (!res.ok) throw new Error(`Failed to load insights (${res.status})`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [surveyId]);

  async function handleCopy() {
    if (!data?.followUpMessage) return;
    try {
      await navigator.clipboard.writeText(data.followUpMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard denied */ }
  }

  const waUrl = data?.followUpMessage
    ? `https://wa.me/?text=${encodeURIComponent(data.followUpMessage)}`
    : "#";

  const btnBase = cn(
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius)]",
    "text-[var(--text-xs)] font-medium transition-colors duration-[var(--transition-fast)]",
    "active:scale-[0.97]"
  );

  return (
    <div className={cn(
      "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)]",
      "shadow-[var(--shadow-sm)] overflow-hidden"
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)]",
        "bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-[var(--border)]"
      )}>
        <Sparkles className="size-4 text-purple-500" />
        <span className="text-[var(--text-sm)] font-semibold text-[var(--foreground)]">AI Intelligence</span>
      </div>

      {loading && <PanelSkeleton />}

      {!loading && error && (
        <div className="flex items-center gap-[var(--space-2)] p-[var(--space-5)] text-[var(--text-sm)] text-[var(--muted-foreground)]">
          <AlertTriangle className="size-4 text-[var(--warning)] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && data && (
        <div className="divide-y divide-[var(--border)]">
          {/* Section 1 — Opportunity Score */}
          <div className="p-[var(--space-5)] space-y-[var(--space-4)]">
            <div className={SH}><Target className="size-3.5" />Opportunity Score</div>
            <div className="flex items-start gap-[var(--space-4)]">
              <ScoreRing score={data.opportunity.score} grade={data.opportunity.grade} />
              <div className="flex-1 min-w-0 space-y-[var(--space-3)]">
                {data.opportunity.factors.map((f, i) => <FactorBar key={i} f={f} />)}
              </div>
            </div>
            <p className="text-[var(--text-sm)] text-[var(--muted-foreground)] leading-relaxed">
              {data.opportunity.summary}
            </p>
          </div>

          {/* Section 2 — Deal Health */}
          <div className="p-[var(--space-5)] space-y-[var(--space-3)]">
            <div className={SH}><Activity className="size-3.5" />Deal Health</div>
            <div className="flex items-center gap-[var(--space-3)]">
              <div className="flex items-center gap-[var(--space-2)]">
                <span className={cn("size-2 rounded-full shrink-0", HEALTH_CFG[data.dealHealth.status].dot)} />
                <span className={cn("text-[var(--text-sm)] font-semibold", HEALTH_CFG[data.dealHealth.status].color)}>
                  {HEALTH_CFG[data.dealHealth.status].label}
                </span>
              </div>
              <span className={cn(
                "text-[var(--text-xs)] font-medium px-2 py-0.5 rounded-[var(--radius-full)]",
                scoreTier(data.dealHealth.score)
              )}>
                {data.dealHealth.score}%
              </span>
            </div>
            <div className="flex items-center gap-[var(--space-3)] text-[var(--text-xs)] text-[var(--muted-foreground)]">
              <span className="flex items-center gap-1"><Clock className="size-3" />{data.dealHealth.daysSinceActivity}d since activity</span>
              <span className="flex items-center gap-1"><Clock className="size-3" />{data.dealHealth.daysInStage}d in stage</span>
            </div>
            {data.dealHealth.reasons.length > 0 && (
              <ul className="space-y-1">
                {data.dealHealth.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-[var(--space-2)] text-[var(--text-xs)] text-[var(--muted-foreground)]">
                    <span className="mt-1 size-1 rounded-full bg-[var(--muted-foreground)] shrink-0" />{r}
                  </li>
                ))}
              </ul>
            )}
            {data.dealHealth.recommendation && (
              <div className="rounded-[var(--radius)] bg-[var(--muted)] px-[var(--space-3)] py-[var(--space-2)]">
                <p className="text-[var(--text-xs)] text-[var(--foreground)] leading-relaxed">
                  <span className="font-semibold">Recommendation:</span> {data.dealHealth.recommendation}
                </p>
              </div>
            )}
          </div>

          {/* Section 3 — Stage Prediction */}
          {data.prediction && (
            <div className="p-[var(--space-5)] space-y-[var(--space-3)]">
              <div className={SH}><TrendingUp className="size-3.5" />Stage Prediction</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-[var(--space-2)]">
                  <ArrowRight className="size-3.5 text-[var(--primary)]" />
                  <span className="text-[var(--text-sm)] font-semibold text-[var(--foreground)]">{data.prediction.nextStageLabel}</span>
                  <span className="text-[var(--text-sm)] text-[var(--primary)] font-semibold">{data.prediction.probability}%</span>
                </div>
                <div className="flex items-center gap-[var(--space-2)]">
                  <span className="text-[var(--text-xs)] text-[var(--muted-foreground)] px-2 py-0.5 rounded-[var(--radius-full)] bg-[var(--muted)]">
                    ~{data.prediction.estimatedDays}d
                  </span>
                  <span className={cn(
                    "text-[var(--text-xs)] font-medium px-2 py-0.5 rounded-[var(--radius-full)] border capitalize",
                    LEVEL_BADGE[data.prediction.confidence]
                  )}>
                    {data.prediction.confidence}
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-[var(--radius-full)] bg-[var(--muted)] overflow-hidden">
                <div
                  className="h-full rounded-[var(--radius-full)] bg-[var(--primary)] transition-all duration-500"
                  style={{ width: `${data.prediction.probability}%` }}
                />
              </div>
            </div>
          )}

          {/* Section 4 — Suggested Offer */}
          <div className="p-[var(--space-5)] space-y-[var(--space-3)]">
            <div className="flex items-center justify-between">
              <div className={SH}><Zap className="size-3.5" />Suggested Offer</div>
              <span className={cn(
                "text-[var(--text-xs)] font-medium px-2 py-0.5 rounded-[var(--radius-full)] border capitalize",
                URGENCY_BADGE[data.suggestedOffer.urgency]
              )}>
                {data.suggestedOffer.urgency} urgency
              </span>
            </div>
            <div className="text-xl font-bold text-[var(--foreground)]">{data.suggestedOffer.commissionRate}</div>
            <p className="text-[var(--text-xs)] text-[var(--muted-foreground)] leading-relaxed">{data.suggestedOffer.rationale}</p>
            {data.suggestedOffer.incentives.length > 0 && (
              <ul className="space-y-1.5">
                {data.suggestedOffer.incentives.map((inc, i) => (
                  <li key={i} className="flex items-start gap-[var(--space-2)] text-[var(--text-xs)] text-[var(--foreground)]">
                    <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />{inc}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Section 5 — Follow-up Message */}
          <div className="p-[var(--space-5)] space-y-[var(--space-3)]">
            <div className={SH}><MessageSquare className="size-3.5" />Follow-up Message</div>
            <div className="rounded-[var(--radius)] bg-[var(--muted)] px-[var(--space-3)] py-[var(--space-3)]">
              <p className="text-[var(--text-sm)] text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                {data.followUpMessage}
              </p>
            </div>
            <div className="flex items-center gap-[var(--space-2)]">
              <button type="button" onClick={handleCopy} className={cn(btnBase, "border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]")}>
                {copied
                  ? <><Check className="size-3.5 text-emerald-500" /><span className="text-emerald-500">Copied!</span></>
                  : <><Copy className="size-3.5" />Copy</>}
              </button>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className={cn(btnBase, "bg-emerald-500 text-white hover:bg-emerald-600")}>
                <MessageSquare className="size-3.5" />WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
