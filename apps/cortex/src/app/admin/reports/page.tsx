"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MapPin,
  CheckCircle2,
  Star,
  TrendingUp,
  CalendarDays,
  Clock,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  ChevronRight,
  ChevronDown,
  Users,
  X,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

/* ---------- Types ---------- */
interface BDEPerformance {
  id: string;
  name: string;
  todaySurveys: number;
  weekSurveys: number;
  totalSurveys: number;
  avgLeadScore: number;
  bestLead: number;
}

interface DailyAggregate {
  visited: number;
  completed: number;
  interested: number;
  strongLeads: number;
  followUpsTomorrow: number;
}

interface DayData {
  date: Date;
  count: number;
}

interface FunnelStep {
  label: string;
  count: number;
  color: string;
}

interface BDESurvey {
  businessName: string;
  category: string;
  leadScore: number;
  leadStatus: string;
  createdAt: string;
}

/* ---------- Helpers ---------- */
function getToken() {
  return localStorage.getItem("token") || "";
}

/* ---------- Stat Tile ---------- */
function AggregateStatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex items-center justify-center h-10 w-10 rounded-lg shrink-0", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */
export default function AdminReportsPage() {
  const [bdePerformance, setBdePerformance] = useState<BDEPerformance[]>([]);
  const [aggregate, setAggregate] = useState<DailyAggregate>({
    visited: 0,
    completed: 0,
    interested: 0,
    strongLeads: 0,
    followUpsTomorrow: 0,
  });
  const [dailyCounts, setDailyCounts] = useState<DayData[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortField, setSortField] = useState<keyof BDEPerformance>("totalSurveys");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedBDE, setSelectedBDE] = useState<string | null>(null);
  const [bdeDetailSurveys, setBdeDetailSurveys] = useState<BDESurvey[]>([]);
  const [bdeDetailLoading, setBdeDetailLoading] = useState(false);
  const [bdeDetailError, setBdeDetailError] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/reports/admin", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      setBdePerformance(data.bdePerformance || []);
      setAggregate(
        data.aggregate || {
          visited: 0,
          completed: 0,
          interested: 0,
          strongLeads: 0,
          followUpsTomorrow: 0,
        }
      );

      // Daily counts for bar chart (last 14 days)
      const counts: DayData[] = (data.dailyCounts || []).map(
        (d: { date: string; count: number }) => ({
          date: new Date(d.date),
          count: d.count,
        })
      );
      // If no data from API, generate empty last 14 days
      if (counts.length === 0) {
        for (let i = 13; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          date.setHours(0, 0, 0, 0);
          counts.push({ date, count: 0 });
        }
      }
      setDailyCounts(counts);

      setFunnel(
        data.funnel || [
          { label: "New", count: 0, color: "bg-blue-500" },
          { label: "Interested", count: 0, color: "bg-amber-500" },
          { label: "Follow-up", count: 0, color: "bg-purple-500" },
          { label: "Onboarded", count: 0, color: "bg-emerald-500" },
        ]
      );
    } catch {
      setError("Failed to load reports");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchData(); }, [fetchData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedBDE) {
      setBdeDetailSurveys([]);
      setBdeDetailError("");
      return;
    }
    let cancelled = false;
    async function fetchBDESurveys() {
      setBdeDetailLoading(true);
      setBdeDetailError("");
      try {
        const res = await fetch(
          `/api/surveys/vendor?bdeId=${selectedBDE}&limit=5`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        if (!res.ok) throw new Error("Failed to fetch BDE surveys");
        const data = await res.json();
        if (!cancelled) {
          setBdeDetailSurveys(data.surveys || []);
        }
      } catch {
        if (!cancelled) setBdeDetailError("Failed to load surveys for this BDE");
      } finally {
        if (!cancelled) setBdeDetailLoading(false);
      }
    }
    fetchBDESurveys();
    return () => { cancelled = true; };
  }, [selectedBDE]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Get selected BDE info from the performance list
  const selectedBDEInfo = selectedBDE
    ? bdePerformance.find((b) => b.id === selectedBDE) || null
    : null;

  function handleSort(field: keyof BDEPerformance) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sortedBDEs = [...bdePerformance].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    return sortDir === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  // Bar chart
  const maxCount = Math.max(...dailyCounts.map((d) => d.count), 1);

  // Funnel
  const maxFunnel = Math.max(...funnel.map((f) => f.count), 1);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Daily Aggregate Report */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">Today&apos;s Aggregate Report</h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
          <div className="grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <AggregateStatCard
              icon={MapPin}
              label="Total Visited"
              value={aggregate.visited}
              color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            />
            <AggregateStatCard
              icon={CheckCircle2}
              label="Total Completed"
              value={aggregate.completed}
              color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            />
            <AggregateStatCard
              icon={Star}
              label="Interested"
              value={aggregate.interested}
              color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
            />
            <AggregateStatCard
              icon={TrendingUp}
              label="Strong Leads"
              value={aggregate.strongLeads}
              color="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
            />
            <AggregateStatCard
              icon={CalendarDays}
              label="Follow-ups Tomorrow"
              value={aggregate.followUpsTomorrow}
              color="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Auto-generated daily report at 6:00 PM</span>
          </div>
        </div>
      </div>

      {/* Team Performance Table */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">Team Performance</h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  {[
                    { key: "name" as const, label: "BDE Name" },
                    { key: "todaySurveys" as const, label: "Today" },
                    { key: "weekSurveys" as const, label: "This Week" },
                    { key: "totalSurveys" as const, label: "Total" },
                    { key: "avgLeadScore" as const, label: "Avg Score" },
                    { key: "bestLead" as const, label: "Best Lead" },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 cursor-pointer hover:text-foreground transition-colors select-none"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className="h-3 w-3" />
                      </span>
                    </th>
                  ))}
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedBDEs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      No BDE performance data available
                    </td>
                  </tr>
                ) : (
                  sortedBDEs.map((bde) => (
                    <tr
                      key={bde.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{bde.name}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{bde.todaySurveys}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{bde.weekSurveys}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground">{bde.totalSurveys}</td>
                      <td className="px-4 py-3 text-sm text-foreground">
                        <span
                          className={cn(
                            "font-medium",
                            bde.avgLeadScore >= 70 && "text-emerald-600 dark:text-emerald-400",
                            bde.avgLeadScore >= 40 && bde.avgLeadScore < 70 && "text-amber-600 dark:text-amber-400",
                            bde.avgLeadScore < 40 && "text-red-600 dark:text-red-400"
                          )}
                        >
                          {bde.avgLeadScore}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground font-medium">{bde.bestLead}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedBDE(selectedBDE === bde.id ? null : bde.id)}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium transition-colors",
                            selectedBDE === bde.id
                              ? "text-blue-700 dark:text-blue-300"
                              : "text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                          )}
                        >
                          {selectedBDE === bde.id ? "Close" : "View"}
                          {selectedBDE === bde.id ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* BDE Detail Panel */}
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          selectedBDE && selectedBDEInfo
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          {selectedBDEInfo && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {selectedBDEInfo.name}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Recent survey activity
                  </p>
                </div>
                <button
                  onClick={() => setSelectedBDE(null)}
                  className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <div>
                  <p className="text-xs text-muted-foreground">Today</p>
                  <p className="text-lg font-bold text-foreground">{selectedBDEInfo.todaySurveys}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">This Week</p>
                  <p className="text-lg font-bold text-foreground">{selectedBDEInfo.weekSurveys}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold text-foreground">{selectedBDEInfo.totalSurveys}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                  <p
                    className={cn(
                      "text-lg font-bold",
                      selectedBDEInfo.avgLeadScore >= 70 && "text-emerald-600 dark:text-emerald-400",
                      selectedBDEInfo.avgLeadScore >= 40 && selectedBDEInfo.avgLeadScore < 70 && "text-amber-600 dark:text-amber-400",
                      selectedBDEInfo.avgLeadScore < 40 && "text-red-600 dark:text-red-400"
                    )}
                  >
                    {selectedBDEInfo.avgLeadScore}
                  </p>
                </div>
              </div>

              {/* Recent surveys list */}
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Recent Surveys
                </p>
                {bdeDetailLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : bdeDetailError ? (
                  <div className="flex items-center gap-2 py-4">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">{bdeDetailError}</p>
                  </div>
                ) : bdeDetailSurveys.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No surveys found for this BDE
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bdeDetailSurveys.map((survey, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 dark:border-zinc-800 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {survey.businessName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {survey.category}
                            <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">|</span>
                            {formatDate(new Date(survey.createdAt))}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                              survey.leadScore >= 70 && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
                              survey.leadScore >= 40 && survey.leadScore < 70 && "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
                              survey.leadScore < 40 && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                            )}
                          >
                            {survey.leadScore}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                              survey.leadStatus === "hot" && "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
                              survey.leadStatus === "warm" && "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
                              survey.leadStatus === "cold" && "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
                              survey.leadStatus === "new" && "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
                              !["hot", "warm", "cold", "new"].includes(survey.leadStatus) && "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                            )}
                          >
                            {survey.leadStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trends */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Surveys per day bar chart */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">Surveys Per Day (Last 14 Days)</h2>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
            <div className="flex items-end gap-1.5 h-40">
              {dailyCounts.map((day, idx) => {
                const heightPct = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                const isToday = idx === dailyCounts.length - 1;
                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center gap-1"
                    title={`${formatDate(day.date)}: ${day.count} surveys`}
                  >
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {day.count > 0 ? day.count : ""}
                    </span>
                    <div
                      className={cn(
                        "w-full rounded-t-sm transition-all min-h-[2px]",
                        isToday
                          ? "bg-blue-500"
                          : "bg-zinc-200 dark:bg-zinc-700"
                      )}
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                    <span className="text-[9px] text-muted-foreground">
                      {day.date.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Lead Conversion Funnel */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4">Lead Conversion Funnel</h2>
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
            <div className="space-y-4">
              {funnel.map((step, idx) => {
                const widthPct = maxFunnel > 0 ? (step.count / maxFunnel) * 100 : 0;
                return (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground">{step.label}</span>
                      <span className="text-sm font-bold text-foreground">{step.count}</span>
                    </div>
                    <div className="h-8 w-full bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden">
                      <div
                        className={cn("h-full rounded-lg transition-all duration-500", step.color)}
                        style={{ width: `${Math.max(widthPct, 2)}%` }}
                      />
                    </div>
                    {idx < funnel.length - 1 && (
                      <div className="flex justify-center my-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" className="text-muted-foreground/40">
                          <path d="M6 0 L6 8 M2 5 L6 9 L10 5" stroke="currentColor" fill="none" strokeWidth="1.5" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
