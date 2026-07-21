'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus,
  Building2,
  Truck,
  ClipboardCheck,
  ThumbsUp,
  Bell,
  Sparkles,
  Star,
  ChevronRight,
  Calendar,
  Clock,
  CheckCircle2,
  RotateCcw,
  TrendingUp,
  BarChart3,
  AlertCircle,
} from 'lucide-react';
import { getStatusColor, getLeadScoreColor } from '@/lib/utils';
import { ShiftTracker } from '@/components/field/shift-tracker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface DashboardStats {
  today: {
    visited: number;
    completed: number;
    interested: number;
    followUps: number;
    newLeads: number;
    avgLeadScore: number;
  };
  recentSurveys: {
    id: string;
    businessName: string;
    category: string;
    leadScore: number;
    leadStatus: string;
    createdAt: string;
    type: 'vendor' | 'rider';
  }[];
  todayFollowUps: {
    id: string;
    businessName: string;
    scheduledAt: string;
    status: string;
    surveyId: string;
  }[];
  weeklyPerformance: {
    day: string;
    count: number;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatTodayDate(): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function formatTime(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

const categoryIcons: Record<string, string> = {
  restaurant: '🍽️',
  kirana: '🏪',
  supermarket: '🛒',
  pharmacy: '💊',
  bakery: '🥐',
  cafe: '☕',
  fruits_vegetables: '🥬',
  meat_shop: '🥩',
  pet_shop: '🐾',
  electronics: '📱',
  stationery: '✏️',
  flower_shop: '🌺',
  others: '🏢',
};

function getCategoryLabel(cat: string): string {
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'new':
      return 'New';
    case 'interested':
      return 'Interested';
    case 'follow_up':
      return 'Follow-up';
    case 'not_interested':
      return 'Not Interested';
    case 'onboarded':
      return 'Onboarded';
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// ProgressRing (visited / target)
// ---------------------------------------------------------------------------

function VisitProgressRing({
  value,
  max,
  size = 72,
}: {
  value: number;
  max: number;
  size?: number;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const strokeWidth = 6;
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  let colorClass = 'stroke-blue-500';
  if (pct >= 80) colorClass = 'stroke-emerald-500';
  else if (pct >= 50) colorClass = 'stroke-amber-500';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-zinc-200 dark:stroke-zinc-700"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className={colorClass}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-none">
          {value}
        </span>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-none mt-0.5">
          / {max}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StarRating
// ---------------------------------------------------------------------------

function StarRating({ score }: { score: number }) {
  const stars = Math.round(score / 20); // 0-100 -> 0-5
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={12}
          className={
            i < stars
              ? 'fill-amber-400 text-amber-400'
              : 'text-zinc-300 dark:text-zinc-600'
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeadScoreBadge
// ---------------------------------------------------------------------------

function LeadScoreBadge({ score }: { score: number }) {
  let bg = 'bg-red-500/10 text-red-600 dark:text-red-400';
  if (score >= 80) bg = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  else if (score >= 60) bg = 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  else if (score >= 40) bg = 'bg-orange-500/10 text-orange-600 dark:text-orange-400';

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${bg}`}>
      {score}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton Loaders
// ---------------------------------------------------------------------------

function SkeletonPulse({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded bg-zinc-200 dark:bg-zinc-700 ${className ?? ''}`}
      style={style}
    />
  );
}

function SkeletonStatCard() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
      <SkeletonPulse className="h-8 w-8 rounded-lg mb-3" />
      <SkeletonPulse className="h-7 w-12 mb-2" />
      <SkeletonPulse className="h-3 w-16" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <SkeletonPulse className="h-10 w-10 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonPulse className="h-3.5 w-2/3" />
        <SkeletonPulse className="h-2.5 w-1/3" />
      </div>
      <SkeletonPulse className="h-5 w-10 rounded-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Page
// ---------------------------------------------------------------------------

const TARGET_VISITS = 20;

export default function DashboardPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      const res = await fetch('/api/dashboard/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) throw new Error('Failed to load dashboard data');
      const data = await res.json();
      setStats(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setUser(JSON.parse(raw));
    } catch { /* ignore parse errors */ }

    fetchStats();
  }, [fetchStats]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Derived data
  const today = stats?.today ?? {
    visited: 0,
    completed: 0,
    interested: 0,
    followUps: 0,
    newLeads: 0,
    avgLeadScore: 0,
  };
  const recentSurveys = stats?.recentSurveys ?? [];
  const todayFollowUps = stats?.todayFollowUps ?? [];
  const weeklyPerformance = stats?.weeklyPerformance ?? [];
  const maxWeekly = Math.max(...weeklyPerformance.map((d) => d.count), 1);
  const displayName = user?.name?.split(' ')[0] ?? 'there';

  // ----- Error state -----
  if (!loading && error) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 max-w-sm w-full text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertCircle className="text-red-500" size={24} />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Unable to load dashboard
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{error}</p>
          <button
            onClick={fetchStats}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors w-full"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Location sharing — only while the BDE is on shift. */}
      <ShiftTracker />

      {/* ==================================================================
          GREETING HEADER
      =================================================================== */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {getGreeting()}, {loading ? '...' : displayName}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {formatTodayDate()}
          </p>
        </div>
        <Link
          href="/dashboard/survey/vendor"
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors flex items-center gap-2 shrink-0 text-sm shadow-sm"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New Survey</span>
        </Link>
      </div>

      {/* ==================================================================
          TODAY'S PROGRESS
      =================================================================== */}
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
          Today&apos;s Progress
        </h3>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Visited skeleton is wider */}
            <div className="col-span-2 sm:col-span-1 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
              <div className="flex items-center gap-4 animate-pulse">
                <SkeletonPulse className="h-[72px] w-[72px] rounded-full" />
                <div className="space-y-2">
                  <SkeletonPulse className="h-4 w-16" />
                  <SkeletonPulse className="h-3 w-24" />
                </div>
              </div>
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonStatCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Visited -- with progress ring */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4 col-span-2 sm:col-span-1 flex items-center gap-4">
              <VisitProgressRing value={today.visited} max={TARGET_VISITS} />
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Visited
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {TARGET_VISITS - today.visited > 0
                    ? `${TARGET_VISITS - today.visited} more to go`
                    : 'Target reached!'}
                </p>
              </div>
            </div>

            {/* Completed */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                <ClipboardCheck size={16} className="text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {today.completed}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Completed</p>
            </div>

            {/* Interested */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-2">
                <ThumbsUp size={16} className="text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {today.interested}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Interested</p>
            </div>

            {/* Follow-ups */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center mb-2">
                <Bell size={16} className="text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {today.followUps}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Follow-ups</p>
            </div>

            {/* New Leads */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
                <Sparkles size={16} className="text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {today.newLeads}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">New Leads</p>
            </div>

            {/* Lead Score Avg */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mb-2">
                <TrendingUp size={16} className="text-purple-500" />
              </div>
              <p className={`text-2xl font-bold ${getLeadScoreColor(today.avgLeadScore)}`}>
                {today.avgLeadScore}
              </p>
              <StarRating score={today.avgLeadScore} />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Avg Score
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ==================================================================
          QUICK ACTIONS
      =================================================================== */}
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/dashboard/survey/vendor"
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5 flex flex-col items-center gap-3 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all active:scale-[0.98] group"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 group-hover:bg-blue-500/20 flex items-center justify-center transition-colors">
              <Building2 size={24} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                New Vendor Survey
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Business visit
              </p>
            </div>
          </Link>
          <Link
            href="/dashboard/survey/rider"
            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5 flex flex-col items-center gap-3 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all active:scale-[0.98] group"
          >
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 flex items-center justify-center transition-colors">
              <Truck size={24} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                New Rider Survey
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Delivery partner
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* ==================================================================
          RECENT SURVEYS
      =================================================================== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Recent Surveys
          </h3>
          <Link
            href="/dashboard/followups"
            className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-0.5 hover:underline"
          >
            View All <ChevronRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : recentSurveys.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
              <ClipboardCheck size={24} className="text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No surveys yet today
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
              Start by visiting a business!
            </p>
            <Link
              href="/dashboard/survey/vendor"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors mt-4 text-sm"
            >
              <Plus size={16} />
              Start a Survey
            </Link>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {recentSurveys.map((survey) => (
              <div
                key={survey.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                {/* Category icon */}
                <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-lg shrink-0">
                  {categoryIcons[survey.category] ?? '🏢'}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {survey.businessName}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {getCategoryLabel(survey.category)}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600">&middot;</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
                      {timeAgo(survey.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Score + status */}
                <div className="flex items-center gap-2 shrink-0">
                  <LeadScoreBadge score={survey.leadScore} />
                  <span
                    className={`hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusColor(survey.leadStatus)}`}
                  >
                    {getStatusLabel(survey.leadStatus)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ==================================================================
          TODAY'S FOLLOW-UPS
      =================================================================== */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Today&apos;s Follow-ups
          </h3>
          {todayFollowUps.length > 0 && (
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5">
              {todayFollowUps.length} pending
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4 animate-pulse"
              >
                <SkeletonPulse className="h-4 w-1/2 mb-2" />
                <SkeletonPulse className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : todayFollowUps.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
              <Calendar size={24} className="text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No follow-ups for today
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Great job keeping things clear!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {todayFollowUps.map((fu) => (
              <div
                key={fu.id}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {fu.businessName}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <Clock size={12} />
                        {formatTime(fu.scheduledAt)}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${
                          fu.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            : fu.status === 'cancelled'
                              ? 'bg-red-500/10 text-red-500 border-red-500/20'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                        }`}
                      >
                        {fu.status}
                      </span>
                    </div>
                  </div>

                  {fu.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          const token = localStorage.getItem('token');
                          await fetch('/api/followups', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ id: fu.id, status: 'completed' }),
                          });
                          fetchStats();
                        }}
                        className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors flex items-center gap-1.5 active:scale-[0.97]"
                      >
                        <CheckCircle2 size={14} />
                        <span className="hidden sm:inline">Complete</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          tomorrow.setHours(10, 0, 0, 0);
                          const token = localStorage.getItem('token');
                          await fetch('/api/followups', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ id: fu.id, scheduledAt: tomorrow.toISOString() }),
                          });
                          fetchStats();
                        }}
                        className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5 active:scale-[0.97]"
                      >
                        <RotateCcw size={14} />
                        <span className="hidden sm:inline">Reschedule</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ==================================================================
          PERFORMANCE THIS WEEK
      =================================================================== */}
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-3">
          Performance This Week
        </h3>

        {loading ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6 animate-pulse">
            <div className="flex items-end justify-between gap-3 h-36">
              {[30, 55, 40, 70, 25, 60, 45].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end h-24 justify-center">
                    <SkeletonPulse
                      className="w-full max-w-[32px]"
                      style={{ height: `${h}%` }}
                    />
                  </div>
                  <SkeletonPulse className="h-2.5 w-6" />
                </div>
              ))}
            </div>
          </div>
        ) : weeklyPerformance.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
              <BarChart3 size={24} className="text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No data for this week yet
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Complete surveys to see your performance chart.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-6">
            <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
              {weeklyPerformance.map((day, i) => {
                const heightPct = maxWeekly > 0 ? (day.count / maxWeekly) * 100 : 0;
                const isToday = i === weeklyPerformance.length - 1;

                return (
                  <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                    {/* Count label */}
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 h-4">
                      {day.count > 0 ? day.count : ''}
                    </span>

                    {/* Bar */}
                    <div className="w-full max-w-[36px] flex items-end" style={{ height: 112 }}>
                      <div
                        className={`w-full rounded-t-md transition-all duration-500 ${
                          isToday
                            ? 'bg-blue-500 dark:bg-blue-400'
                            : 'bg-zinc-200 dark:bg-zinc-700'
                        }`}
                        style={{ height: `${Math.max(heightPct, 4)}%` }}
                      />
                    </div>

                    {/* Day label */}
                    <span
                      className={`text-[10px] font-medium ${
                        isToday
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      {day.day}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Total this week</p>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {weeklyPerformance.reduce((sum, d) => sum + d.count, 0)} surveys
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
