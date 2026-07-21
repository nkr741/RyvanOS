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
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

/* ---------- Types ---------- */
interface DailyReport {
  id: string;
  bdeId: string;
  date: string;
  visited: number;
  completed: number;
  interested: number;
  strongLeads: number;
  followUps: number;
  summary: string | null;
  createdAt: string;
}

/* ---------- Helpers ---------- */
function getToken() {
  return localStorage.getItem("token") || "";
}

function getUserId() {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    return u.id || "";
  } catch {
    return "";
  }
}

function isSameDay(d1: string, d2: Date) {
  const a = new Date(d1);
  return (
    a.getFullYear() === d2.getFullYear() &&
    a.getMonth() === d2.getMonth() &&
    a.getDate() === d2.getDate()
  );
}

function getDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* ---------- Stat Card ---------- */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5">
      <div className={cn("flex items-center justify-center h-12 w-12 rounded-xl", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/* ---------- Activity Cell (for contribution graph) ---------- */
function ActivityCell({ level, date }: { level: number; date: Date }) {
  const bg = [
    "bg-zinc-100 dark:bg-zinc-800",
    "bg-emerald-200 dark:bg-emerald-900",
    "bg-emerald-400 dark:bg-emerald-700",
    "bg-emerald-600 dark:bg-emerald-500",
    "bg-emerald-800 dark:bg-emerald-400",
  ][Math.min(level, 4)];

  return (
    <div
      className={cn("h-4 w-4 rounded-sm", bg)}
      title={`${formatDate(date)}: ${level} surveys`}
    />
  );
}

/* ---------- Main Page ---------- */
export default function BDEReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const userId = getUserId();
      const res = await fetch(`/api/reports/daily?bdeId=${userId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setReports(Array.isArray(data) ? data : data.reports || []);
    } catch {
      setError("Failed to load reports");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchReports(); }, [fetchReports]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Today's report
  const today = new Date();
  const todayReport = reports.find((r) => isSameDay(r.date, today));

  // Weekly summary (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = getDaysAgo(i);
    const report = reports.find((r) => isSameDay(r.date, date));
    return {
      date,
      visited: report?.visited || 0,
      completed: report?.completed || 0,
      interested: report?.interested || 0,
      strongLeads: report?.strongLeads || 0,
      followUps: report?.followUps || 0,
    };
  }).reverse();

  const weeklyTotals = last7Days.reduce(
    (acc, day) => ({
      visited: acc.visited + day.visited,
      completed: acc.completed + day.completed,
      interested: acc.interested + day.interested,
      strongLeads: acc.strongLeads + day.strongLeads,
      followUps: acc.followUps + day.followUps,
    }),
    { visited: 0, completed: 0, interested: 0, strongLeads: 0, followUps: 0 }
  );

  const weeklyAvg = {
    visited: +(weeklyTotals.visited / 7).toFixed(1),
    completed: +(weeklyTotals.completed / 7).toFixed(1),
    interested: +(weeklyTotals.interested / 7).toFixed(1),
    strongLeads: +(weeklyTotals.strongLeads / 7).toFixed(1),
    followUps: +(weeklyTotals.followUps / 7).toFixed(1),
  };

  // Monthly calendar (contribution graph style)
  const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthDays = Array.from({ length: daysInCurrentMonth }, (_, i) => {
    const date = new Date(today.getFullYear(), today.getMonth(), i + 1);
    const report = reports.find((r) => isSameDay(r.date, date));
    return {
      date,
      count: report?.visited || 0,
      day: i + 1,
    };
  });

  const monthlyTotals = monthDays.reduce(
    (acc, day) => {
      const report = reports.find((r) => isSameDay(r.date, day.date));
      return {
        visited: acc.visited + (report?.visited || 0),
        completed: acc.completed + (report?.completed || 0),
        interested: acc.interested + (report?.interested || 0),
        strongLeads: acc.strongLeads + (report?.strongLeads || 0),
        followUps: acc.followUps + (report?.followUps || 0),
      };
    },
    { visited: 0, completed: 0, interested: 0, strongLeads: 0, followUps: 0 }
  );

  // Calendar grid starts on the correct day of week
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getDay();

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

      {/* Today's Report Card */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">Today&apos;s Report</h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              icon={MapPin}
              label="Visited"
              value={todayReport?.visited || 0}
              color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed"
              value={todayReport?.completed || 0}
              color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            />
            <StatCard
              icon={Star}
              label="Interested"
              value={todayReport?.interested || 0}
              color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Strong Leads"
              value={todayReport?.strongLeads || 0}
              color="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
            />
            <StatCard
              icon={CalendarDays}
              label="Follow-ups"
              value={todayReport?.followUps || 0}
              color="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Auto-generated daily report at 6:00 PM</span>
          </div>
        </div>
      </div>

      {/* Weekly Summary */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">Weekly Summary</h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Date
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Visited
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Completed
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Interested
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Leads
                  </th>
                </tr>
              </thead>
              <tbody>
                {last7Days.map((day, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-foreground">{formatDate(day.date)}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium">{day.visited}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium">{day.completed}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium">{day.interested}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium">{day.strongLeads}</td>
                  </tr>
                ))}
                {/* Totals */}
                <tr className="bg-zinc-50 dark:bg-zinc-800/50 font-semibold">
                  <td className="px-4 py-3 text-sm text-foreground">Total</td>
                  <td className="px-4 py-3 text-sm text-foreground">{weeklyTotals.visited}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{weeklyTotals.completed}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{weeklyTotals.interested}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{weeklyTotals.strongLeads}</td>
                </tr>
                {/* Daily Average */}
                <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-muted-foreground">
                  <td className="px-4 py-3 text-sm">Daily Avg</td>
                  <td className="px-4 py-3 text-sm">{weeklyAvg.visited}</td>
                  <td className="px-4 py-3 text-sm">{weeklyAvg.completed}</td>
                  <td className="px-4 py-3 text-sm">{weeklyAvg.interested}</td>
                  <td className="px-4 py-3 text-sm">{weeklyAvg.strongLeads}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Monthly Performance */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-4">
          Monthly Performance &mdash;{" "}
          {today.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
          {/* Contribution graph */}
          <div className="mb-6">
            <div className="grid grid-cols-7 gap-1.5 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-[10px] font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {/* Empty cells for days before the month starts */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="h-4 w-4" />
              ))}
              {monthDays.map((day) => (
                <ActivityCell key={day.day} level={day.count} date={day.date} />
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={cn(
                    "h-3 w-3 rounded-sm",
                    [
                      "bg-zinc-100 dark:bg-zinc-800",
                      "bg-emerald-200 dark:bg-emerald-900",
                      "bg-emerald-400 dark:bg-emerald-700",
                      "bg-emerald-600 dark:bg-emerald-500",
                      "bg-emerald-800 dark:bg-emerald-400",
                    ][level]
                  )}
                />
              ))}
              <span>More</span>
            </div>
          </div>

          {/* Monthly totals */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div>
              <p className="text-xs text-muted-foreground">Visited</p>
              <p className="text-lg font-bold text-foreground">{monthlyTotals.visited}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="text-lg font-bold text-foreground">{monthlyTotals.completed}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Interested</p>
              <p className="text-lg font-bold text-foreground">{monthlyTotals.interested}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Strong Leads</p>
              <p className="text-lg font-bold text-foreground">{monthlyTotals.strongLeads}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Follow-ups</p>
              <p className="text-lg font-bold text-foreground">{monthlyTotals.followUps}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
