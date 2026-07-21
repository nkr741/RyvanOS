"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  ListTodo,
  MapPin,
  MessageSquare,
  Mail,
  Phone,
  Plus,
  Search,
  StickyNote,
  Trash2,
  X,
  AlertCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalFooter } from "@/components/ui/modal";

/* ---------- Types ---------- */
interface Survey {
  id: string;
  businessName: string;
  ownerName: string;
  mobile: string;
  category?: string;
  leadScore?: number;
  leadStatus?: string;
}

interface BDE {
  id: string;
  name: string;
  email: string;
}

interface FollowUp {
  id: string;
  surveyId: string;
  bdeId: string;
  scheduledAt: string;
  notes: string | null;
  status: string;
  priority?: string;
  category?: string;
  reminderAt?: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  survey: Survey;
  bde?: BDE;
}

interface Activity {
  id: string;
  type: string;
  content: string;
  surveyId?: string | null;
  surveyName?: string;
  userId: string;
  userName?: string;
  createdAt: string;
  survey?: { id: string; businessName: string } | null;
  user?: { id: string; name: string } | null;
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

function getUserName() {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    return u.name || "You";
  } catch {
    return "You";
  }
}

function relativeTime(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);
  const diffMs = target.getTime() - now.getTime();
  const absDiffMs = Math.abs(diffMs);
  const minutes = Math.floor(absDiffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (diffMs < 0) {
    if (minutes < 60) return `overdue by ${minutes}m`;
    if (hours < 24) return `overdue by ${hours}h`;
    return `overdue by ${days}d`;
  }
  if (minutes < 60) return `in ${minutes}m`;
  if (hours < 24) return `in ${hours}h`;
  return `in ${days}d`;
}

function isOverdue(fu: FollowUp) {
  return fu.status === "pending" && new Date(fu.scheduledAt) < new Date();
}

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
const CATEGORIES = ["follow_up", "call", "visit", "demo", "negotiation", "onboarding"] as const;
const ACTIVITY_TYPES = ["note", "call", "email", "whatsapp", "visit"] as const;

const priorityConfig: Record<string, { color: string; label: string }> = {
  urgent: {
    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    label: "Urgent",
  },
  high: {
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
    label: "High",
  },
  medium: {
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    label: "Medium",
  },
  low: { color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400", label: "Low" },
};

const categoryLabels: Record<string, string> = {
  follow_up: "Follow Up",
  call: "Call",
  visit: "Visit",
  demo: "Demo",
  negotiation: "Negotiation",
  onboarding: "Onboarding",
};

const activityIcons: Record<string, typeof StickyNote> = {
  note: StickyNote,
  call: Phone,
  email: Mail,
  whatsapp: MessageSquare,
  visit: MapPin,
};

/* ================================================================== */
/*  Tab 1 — Tasks                                                      */
/* ================================================================== */

function TaskCard({
  task,
  onComplete,
  onReschedule,
  onDelete,
  onCall,
  actionLoading,
}: {
  task: FollowUp;
  onComplete: (id: string) => void;
  onReschedule: (t: FollowUp) => void;
  onDelete: (id: string) => void;
  onCall: (mobile: string) => void;
  actionLoading: string | null;
}) {
  const overdue = isOverdue(task);
  const isProcessing = actionLoading === task.id;
  const pri = priorityConfig[task.priority || "medium"] || priorityConfig.medium;
  const catLabel = categoryLabels[task.category || "follow_up"] || "Follow Up";

  return (
    <div
      className={cn(
        "group bg-white dark:bg-zinc-900 rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 p-4 sm:p-5",
        overdue
          ? "border-red-200 dark:border-red-800/60"
          : task.status === "completed"
            ? "border-emerald-200 dark:border-emerald-800/60 opacity-80"
            : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {task.survey.businessName}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{task.survey.ownerName}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              pri.color,
            )}
          >
            {pri.label}
          </span>
          {task.status === "completed" ? (
            <Badge variant="success" dot>
              Completed
            </Badge>
          ) : overdue ? (
            <Badge variant="danger" dot>
              Overdue
            </Badge>
          ) : (
            <Badge variant="warning" dot>
              Pending
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {formatDate(task.scheduledAt)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {formatTime(task.scheduledAt)}
        </span>
        <span
          className={cn(
            "font-medium",
            overdue ? "text-red-500 dark:text-red-400" : "text-blue-500 dark:text-blue-400",
          )}
        >
          {relativeTime(task.scheduledAt)}
        </span>
        <span className="inline-flex items-center rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
          {catLabel}
        </span>
      </div>

      {task.notes && (
        <div className="mt-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3 flex items-start gap-2">
          <StickyNote className="h-3.5 w-3.5 shrink-0 text-zinc-400 mt-0.5" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2">
            {task.notes}
          </p>
        </div>
      )}

      {task.status !== "completed" && (
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <button
            onClick={() => onComplete(task.id)}
            disabled={isProcessing}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Complete
          </button>
          <button
            onClick={() => onReschedule(task)}
            disabled={isProcessing}
            className="inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            <Clock className="h-3.5 w-3.5" />
            Reschedule
          </button>
          {task.survey.mobile && (
            <>
              <a
                href={`tel:${task.survey.mobile}`}
                onClick={(e) => {
                  e.preventDefault();
                  onCall(task.survey.mobile);
                }}
                className="inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <Phone className="h-3.5 w-3.5" />
                Call
              </a>
              <a
                href={`https://wa.me/${task.survey.mobile.replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            </>
          )}
          <button
            onClick={() => onDelete(task.id)}
            disabled={isProcessing}
            className="inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-red-500 rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {task.status === "completed" && task.completedAt && (
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
          Completed {formatDate(task.completedAt)} at {formatTime(task.completedAt)}
        </p>
      )}
    </div>
  );
}

function TasksTab({
  followUps,
  surveys,
  isLoading,
  onRefresh,
}: {
  followUps: FollowUp[];
  surveys: Survey[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<FollowUp | null>(null);
  const [surveySearch, setSurveySearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [newSurveyId, setNewSurveyId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("10:00");
  const [newPriority, setNewPriority] = useState("medium");
  const [newCategory, setNewCategory] = useState("follow_up");
  const [newNotes, setNewNotes] = useState("");

  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("10:00");

  const filtered = useMemo(() => {
    return followUps.filter((f) => {
      if (statusFilter === "pending" && (f.status === "completed" || isOverdue(f))) return false;
      if (statusFilter === "completed" && f.status !== "completed") return false;
      if (statusFilter === "overdue" && !isOverdue(f)) return false;
      if (priorityFilter !== "all" && (f.priority || "medium") !== priorityFilter) return false;
      if (categoryFilter !== "all" && (f.category || "follow_up") !== categoryFilter) return false;
      return true;
    });
  }, [followUps, statusFilter, priorityFilter, categoryFilter]);

  const counts = useMemo(() => {
    const pending = followUps.filter((f) => f.status === "pending" && !isOverdue(f)).length;
    const completed = followUps.filter((f) => f.status === "completed").length;
    const overdue = followUps.filter((f) => isOverdue(f)).length;
    return { pending, completed, overdue };
  }, [followUps]);

  const grouped = useMemo(() => {
    const now = new Date();
    const today: FollowUp[] = [];
    const upcoming: FollowUp[] = [];
    const overdue: FollowUp[] = [];
    const completed: FollowUp[] = [];

    filtered.forEach((f) => {
      if (f.status === "completed") {
        completed.push(f);
        return;
      }
      const d = new Date(f.scheduledAt);
      if (d < now) {
        overdue.push(f);
        return;
      }
      if (isSameDay(d, now)) {
        today.push(f);
        return;
      }
      upcoming.push(f);
    });

    overdue.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    today.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    upcoming.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    completed.sort(
      (a, b) =>
        new Date(b.completedAt || b.updatedAt).getTime() -
        new Date(a.completedAt || a.updatedAt).getTime(),
    );

    return { today, upcoming, overdue, completed };
  }, [filtered]);

  async function handleComplete(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch("/api/followups", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id, status: "completed" }),
      });
      if (!res.ok) throw new Error("Failed");
      onRefresh();
    } catch {
      setError("Failed to mark complete");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch("/api/followups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed");
      onRefresh();
    } catch {
      setError("Failed to delete task");
    } finally {
      setActionLoading(null);
    }
  }

  function openReschedule(fu: FollowUp) {
    setRescheduleTarget(fu);
    const d = new Date(fu.scheduledAt);
    setRescheduleDate(d.toISOString().split("T")[0]);
    setRescheduleTime(d.toTimeString().slice(0, 5));
    setShowRescheduleModal(true);
  }

  async function handleReschedule() {
    if (!rescheduleTarget || !rescheduleDate) return;
    setSubmitting(true);
    try {
      const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}:00`).toISOString();
      const res = await fetch("/api/followups", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ id: rescheduleTarget.id, scheduledAt }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowRescheduleModal(false);
      setRescheduleTarget(null);
      onRefresh();
    } catch {
      setError("Failed to reschedule");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate() {
    if (!newSurveyId || !newDate) return;
    setSubmitting(true);
    try {
      const scheduledAt = new Date(`${newDate}T${newTime}:00`).toISOString();
      const res = await fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          surveyId: newSurveyId,
          bdeId: getUserId(),
          scheduledAt,
          notes: newNotes || null,
          priority: newPriority,
          category: newCategory,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowNewModal(false);
      setNewSurveyId("");
      setNewDate("");
      setNewTime("10:00");
      setNewPriority("medium");
      setNewCategory("follow_up");
      setNewNotes("");
      setSurveySearch("");
      onRefresh();
    } catch {
      setError("Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCall(mobile: string) {
    window.location.href = `tel:${mobile}`;
  }

  const filteredSurveys = surveys.filter(
    (s) =>
      s.businessName?.toLowerCase().includes(surveySearch.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(surveySearch.toLowerCase()),
  );

  function renderGroup(title: string, items: FollowUp[], emptyMsg?: string) {
    if (items.length === 0 && !emptyMsg) return null;
    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {title}
          </h3>
          <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
            {items.length}
          </span>
        </div>
        {items.length === 0 && emptyMsg ? (
          <div className="text-center py-8 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{emptyMsg}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onComplete={handleComplete}
                onReschedule={openReschedule}
                onDelete={handleDelete}
                onCall={handleCall}
                actionLoading={actionLoading}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Clock className="h-3.5 w-3.5" /> {counts.pending} pending
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" /> {counts.completed} done
            </span>
            <span className="text-zinc-300 dark:text-zinc-600">|</span>
            <span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5" /> {counts.overdue} overdue
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors text-sm shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        <Filter className="h-4 w-4 text-zinc-400 shrink-0" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue</option>
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">All Priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityConfig[p].label}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabels[c]}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 mb-4">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => setError("")} className="ml-auto">
            <X className="h-4 w-4 text-red-400" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 animate-pulse"
            >
              <div className="h-4 w-48 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
              <div className="h-3 w-32 bg-zinc-100 dark:bg-zinc-800 rounded mb-3" />
              <div className="h-3 w-64 bg-zinc-100 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <ListTodo className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            No tasks found
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            {statusFilter !== "all" || priorityFilter !== "all" || categoryFilter !== "all"
              ? "Try adjusting your filters"
              : "Schedule your first task to get started"}
          </p>
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> New Task
          </button>
        </div>
      ) : (
        <>
          {renderGroup("Overdue", grouped.overdue)}
          {renderGroup("Today", grouped.today, "All caught up for today!")}
          {renderGroup("Upcoming", grouped.upcoming)}
          {renderGroup("Completed", grouped.completed)}
        </>
      )}

      {/* New Task Modal */}
      <Modal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New Task"
        description="Create a task linked to a survey."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Survey
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search by business name..."
                value={surveySearch}
                onChange={(e) => setSurveySearch(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent pl-10 pr-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            {surveySearch && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {filteredSurveys.length === 0 ? (
                  <p className="p-3 text-xs text-zinc-400">No surveys found</p>
                ) : (
                  filteredSurveys.slice(0, 10).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setNewSurveyId(s.id);
                        setSurveySearch(s.businessName);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-b-0",
                        newSurveyId === s.id && "bg-blue-50 dark:bg-blue-950",
                      )}
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {s.businessName}
                      </span>
                      <span className="text-xs text-zinc-400 ml-2">{s.ownerName}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {newSurveyId && !surveySearch && (
              <p className="mt-1 text-xs text-zinc-400">
                Selected: {surveys.find((s) => s.id === newSurveyId)?.businessName}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Time
              </label>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Priority
              </label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityConfig[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabels[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Notes
            </label>
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={3}
              placeholder="Add any notes..."
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
          </div>
        </div>
        <ModalFooter>
          <button
            onClick={() => setShowNewModal(false)}
            className="px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!newSurveyId || !newDate || submitting}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium text-sm transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Create Task
          </button>
        </ModalFooter>
      </Modal>

      {/* Reschedule Modal */}
      <Modal
        open={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        title="Reschedule Task"
        description={
          rescheduleTarget ? `Reschedule task for ${rescheduleTarget.survey.businessName}` : ""
        }
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              New Date
            </label>
            <input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              New Time
            </label>
            <input
              type="time"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>
        <ModalFooter>
          <button
            onClick={() => setShowRescheduleModal(false)}
            className="px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReschedule}
            disabled={!rescheduleDate || submitting}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium text-sm transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Reschedule
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

/* ================================================================== */
/*  Tab 2 — Notes (Activity Timeline)                                  */
/* ================================================================== */

function NotesTab({ surveys }: { surveys: Survey[] }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newType, setNewType] = useState("note");
  const [newContent, setNewContent] = useState("");
  const [newSurveyId, setNewSurveyId] = useState("");
  const [surveySearch, setSurveySearch] = useState("");

  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/activities", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setActivities(Array.isArray(data) ? data : data.activities || []);
    } catch {
      setError("Failed to load activities");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleAdd() {
    if (!newContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          type: newType,
          content: newContent,
          surveyId: newSurveyId || null,
          userId: getUserId(),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setShowAddModal(false);
      setNewType("note");
      setNewContent("");
      setNewSurveyId("");
      setSurveySearch("");
      fetchActivities();
    } catch {
      setError("Failed to add activity");
    } finally {
      setSubmitting(false);
    }
  }

  const filtered =
    typeFilter === "all" ? activities : activities.filter((a) => a.type === typeFilter);
  const filteredSurveys = surveys.filter(
    (s) =>
      s.businessName?.toLowerCase().includes(surveySearch.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(surveySearch.toLowerCase()),
  );

  function activityRelativeTime(dateStr: string): string {
    const now = new Date();
    const d = new Date(dateStr);
    const diffMs = now.getTime() - d.getTime();
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">All Types</option>
            <option value="note">Note</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="visit">Visit</option>
          </select>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors text-sm shadow-sm"
        >
          <Plus className="h-4 w-4" /> Add Note
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 mb-4">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => setError("")} className="ml-auto">
            <X className="h-4 w-4 text-red-400" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <div className="flex-1">
                  <div className="h-3 w-40 bg-zinc-200 dark:bg-zinc-700 rounded mb-2" />
                  <div className="h-3 w-64 bg-zinc-100 dark:bg-zinc-800 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <StickyNote className="h-12 w-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            No activities yet
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
            Start logging your interactions
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Note
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[22px] top-0 bottom-0 w-px bg-zinc-200 dark:bg-zinc-800" />
          <div className="space-y-1">
            {filtered.map((activity) => {
              const Icon = activityIcons[activity.type] || StickyNote;
              const linkedName = activity.survey?.businessName || activity.surveyName || null;
              const userName = activity.user?.name || activity.userName || getUserName();
              return (
                <div key={activity.id} className="relative pl-12 py-3">
                  <div
                    className={cn(
                      "absolute left-2.5 top-4 h-9 w-9 rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-950 z-10",
                      activity.type === "call"
                        ? "bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400"
                        : activity.type === "email"
                          ? "bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400"
                          : activity.type === "whatsapp"
                            ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
                            : activity.type === "visit"
                              ? "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400"
                              : "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm">
                    <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
                      {activity.content}
                    </p>
                    {linkedName && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                        <ArrowLeft className="h-3 w-3" /> {linkedName}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                      <span className="font-medium">{userName}</span>
                      <span>{activityRelativeTime(activity.createdAt)}</span>
                      <span className="uppercase tracking-wider font-semibold">
                        {activity.type}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Activity"
        description="Log an interaction or note."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Type
            </label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Content
            </label>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              placeholder="What happened?"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              Link to Survey (optional)
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search surveys..."
                value={surveySearch}
                onChange={(e) => setSurveySearch(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent pl-10 pr-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            {surveySearch && (
              <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                {filteredSurveys.length === 0 ? (
                  <p className="p-3 text-xs text-zinc-400">No surveys found</p>
                ) : (
                  filteredSurveys.slice(0, 8).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setNewSurveyId(s.id);
                        setSurveySearch(s.businessName);
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-b-0",
                        newSurveyId === s.id && "bg-blue-50 dark:bg-blue-950",
                      )}
                    >
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {s.businessName}
                      </span>
                      <span className="text-xs text-zinc-400 ml-2">{s.ownerName}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <ModalFooter>
          <button
            onClick={() => setShowAddModal(false)}
            className="px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!newContent.trim() || submitting}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium text-sm transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

/* ================================================================== */
/*  Tab 3 — Calendar                                                   */
/* ================================================================== */

function CalendarTab({ followUps }: { followUps: FollowUp[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const today = new Date();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7; // Monday-based
  const totalDays = lastDay.getDate();
  const totalCells = Math.ceil((startPad + totalDays) / 7) * 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    if (i < startPad || i >= startPad + totalDays) {
      cells.push(null);
    } else {
      cells.push(new Date(year, month, i - startPad + 1));
    }
  }

  function getTasksForDate(date: Date) {
    return followUps.filter((f) => isSameDay(new Date(f.scheduledAt), date));
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  }

  function goToToday() {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  }

  const selectedTasks = selectedDate ? getTasksForDate(selectedDate) : [];
  const monthName = currentDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const dayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      {/* Calendar header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{monthName}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline px-2 py-1"
          >
            Today
          </button>
          <button
            onClick={prevMonth}
            className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </button>
          <button
            onClick={nextMonth}
            className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800">
          {dayHeaders.map((d) => (
            <div
              key={d}
              className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((date, idx) => {
            if (!date) {
              return (
                <div
                  key={idx}
                  className="h-20 sm:h-24 border-b border-r border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-950/50"
                />
              );
            }
            const tasks = getTasksForDate(date);
            const isToday = isSameDay(date, today);
            const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
            const completedCount = tasks.filter((t) => t.status === "completed").length;
            const overdueCount = tasks.filter((t) => isOverdue(t)).length;
            const pendingCount = tasks.length - completedCount - overdueCount;

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(date)}
                className={cn(
                  "h-20 sm:h-24 border-b border-r border-zinc-100 dark:border-zinc-800/50 p-1.5 sm:p-2 text-left transition-colors relative group/cell",
                  isSelected && "bg-blue-50 dark:bg-blue-950/30",
                  !isSelected && tasks.length > 0 && "hover:bg-zinc-50 dark:hover:bg-zinc-800/30",
                  !isSelected &&
                    tasks.length === 0 &&
                    "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20",
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium",
                    isToday && "bg-blue-600 text-white ring-2 ring-blue-200 dark:ring-blue-800",
                    !isToday && isSelected && "text-blue-700 dark:text-blue-300 font-semibold",
                    !isToday && !isSelected && "text-zinc-700 dark:text-zinc-300",
                  )}
                >
                  {date.getDate()}
                </span>
                {tasks.length > 0 && (
                  <div className="flex items-center gap-0.5 mt-1">
                    {pendingCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                    {overdueCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                    {completedCount > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    )}
                    <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500 ml-0.5">
                      {tasks.length}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day panel */}
      {selectedDate && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {selectedDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 text-[10px] font-medium text-zinc-500">
              {selectedTasks.length}
            </span>
          </div>
          {selectedTasks.length === 0 ? (
            <div className="text-center py-8 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <Calendar className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No tasks scheduled for this day
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedTasks.map((task) => {
                const overdue = isOverdue(task);
                const pri = priorityConfig[task.priority || "medium"] || priorityConfig.medium;
                return (
                  <div
                    key={task.id}
                    className={cn(
                      "bg-white dark:bg-zinc-900 rounded-xl border p-4 shadow-sm",
                      overdue
                        ? "border-red-200 dark:border-red-800/60"
                        : task.status === "completed"
                          ? "border-emerald-200 dark:border-emerald-800/60"
                          : "border-zinc-200 dark:border-zinc-800",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {task.survey.businessName}
                        </h4>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {task.survey.ownerName}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            pri.color,
                          )}
                        >
                          {pri.label}
                        </span>
                        {task.status === "completed" ? (
                          <Badge variant="success" dot>
                            Done
                          </Badge>
                        ) : overdue ? (
                          <Badge variant="danger" dot>
                            Overdue
                          </Badge>
                        ) : (
                          <Badge variant="warning" dot>
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(task.scheduledAt)}
                      </span>
                      {task.notes && <span className="truncate max-w-[200px]">{task.notes}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */

const tabs = [
  { id: "tasks" as const, label: "Tasks", icon: ListTodo },
  { id: "notes" as const, label: "Notes", icon: StickyNote },
  { id: "calendar" as const, label: "Calendar", icon: Calendar },
];

export default function FollowUpsPage() {
  const [activeTab, setActiveTab] = useState<"tasks" | "notes" | "calendar">("tasks");
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const fetchFollowUps = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const userId = getUserId();
      const res = await fetch(`/api/followups?bdeId=${userId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setFollowUps(Array.isArray(data) ? data : data.followUps || []);
    } catch {
      setLoadError("Failed to load tasks. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSurveys = useCallback(async () => {
    try {
      const res = await fetch("/api/surveys/vendor", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setSurveys(Array.isArray(data) ? data : data.surveys || []);
    } catch (err) {
      console.error("[dashboard/followups] Failed to fetch surveys:", err);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchFollowUps();
    fetchSurveys();
  }, [fetchFollowUps, fetchSurveys]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loadError && followUps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
          Something went wrong
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">{loadError}</p>
        <button
          onClick={fetchFollowUps}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          <Loader2 className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "tasks" && (
        <TasksTab
          followUps={followUps}
          surveys={surveys}
          isLoading={isLoading}
          onRefresh={fetchFollowUps}
        />
      )}
      {activeTab === "notes" && <NotesTab surveys={surveys} />}
      {activeTab === "calendar" && <CalendarTab followUps={followUps} />}
    </div>
  );
}
