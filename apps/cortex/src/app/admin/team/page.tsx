"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  UserPlus,
  Search,
  MoreHorizontal,
  Eye,
  UserX,
  UserCheck,
  Loader2,
  AlertCircle,
  X,
  Users,
  ClipboardList,
  Calendar,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Modal, ModalFooter } from "@/components/ui/modal";

/* ---------- Types ---------- */
interface BDE {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    vendorSurveys: number;
    riderSurveys: number;
  };
}

interface DashboardStats {
  teamPerformance?: Array<{
    id: string;
    name: string;
    surveysToday: number;
    totalSurveys: number;
    avgLeadScore: number;
    conversionRate: number;
  }>;
  byBDE?: Array<{
    bdeId: string;
    bdeName: string;
    count: number;
    avgLeadScore: number;
  }>;
}

/* ---------- Helpers ---------- */
function getToken() {
  return localStorage.getItem("token") || "";
}

function scoreColorClass(score: number) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  if (score >= 40) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBgClass(score: number) {
  if (score >= 80) return "bg-emerald-500/10";
  if (score >= 60) return "bg-amber-500/10";
  if (score >= 40) return "bg-orange-500/10";
  return "bg-red-500/10";
}

/* ---------- Main Page ---------- */
export default function TeamManagementPage() {
  const [bdes, setBdes] = useState<BDE[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Add BDE form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const fetchBDEs = useCallback(async () => {
    setIsLoading(true);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [teamRes, statsRes] = await Promise.all([
        fetch("/api/admin/team", { headers }),
        fetch("/api/dashboard/stats", { headers }).catch(() => null),
      ]);

      if (!teamRes.ok) throw new Error("Failed to fetch");
      const data = await teamRes.json();
      setBdes(Array.isArray(data) ? data : data.users || data.bdes || []);

      if (statsRes && statsRes.ok) {
        try {
          const statsData = await statsRes.json();
          setDashboardStats(statsData);
        } catch {
          // stats parse error is non-fatal
        }
      }
    } catch {
      setError("Failed to load team members");
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchBDEs(); }, [fetchBDEs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Close action menu on click outside
  useEffect(() => {
    function handleClick() {
      setActionMenu(null);
    }
    if (actionMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [actionMenu]);

  async function handleAddBDE() {
    if (!newName || !newEmail || !newPassword) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          name: newName,
          email: newEmail,
          phone: newPhone || null,
          password: newPassword,
          role: "bde",
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to add BDE");
      }
      setShowAddModal(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewPassword("");
      await fetchBDEs();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add team member");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(bde: BDE) {
    try {
      const res = await fetch(`/api/admin/team/${bde.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ active: !bde.active }),
      });
      if (!res.ok) throw new Error("Failed");
      await fetchBDEs();
    } catch {
      setError("Failed to update status");
    }
  }

  const totalSurveys = (bde: BDE) =>
    (bde._count?.vendorSurveys || 0) + (bde._count?.riderSurveys || 0);

  // Map dashboard stats to BDE data for today's surveys and avg lead score
  function getBDEStats(bdeId: string) {
    // Try teamPerformance first (from admin page stats)
    const teamEntry = dashboardStats?.teamPerformance?.find(
      (t) => t.id === bdeId
    );
    if (teamEntry) {
      return {
        surveysToday: teamEntry.surveysToday,
        avgLeadScore: teamEntry.avgLeadScore,
      };
    }
    // Fall back to byBDE from /api/dashboard/stats
    const byBDEEntry = dashboardStats?.byBDE?.find(
      (b) => b.bdeId === bdeId
    );
    if (byBDEEntry) {
      return {
        surveysToday: 0,
        avgLeadScore: byBDEEntry.avgLeadScore,
      };
    }
    return { surveysToday: 0, avgLeadScore: 0 };
  }

  const filteredBDEs = bdes.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.email.toLowerCase().includes(search.toLowerCase()) ||
      (b.phone && b.phone.includes(search))
  );

  // Summary stats
  const totalBDECount = bdes.length;
  const activeBDECount = bdes.filter((b) => b.active).length;
  const activeToday = bdes.filter((b) => {
    const stats = getBDEStats(b.id);
    return stats.surveysToday > 0;
  }).length;
  const avgPerformance =
    bdes.length > 0
      ? Math.round(
          bdes.reduce((sum, b) => sum + getBDEStats(b.id).avgLeadScore, 0) /
            bdes.length
        )
      : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => setError("")} className="ml-auto">
            <X className="h-4 w-4 text-red-400" />
          </button>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {totalBDECount}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Total BDEs ({activeBDECount} active)
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950">
              <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {activeToday}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Active Today
          </p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950">
              <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <p className={cn("text-2xl font-bold", scoreColorClass(avgPerformance))}>
            {avgPerformance}%
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Average Performance
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors text-sm shrink-0"
        >
          <UserPlus className="h-4 w-4" />
          Add New BDE
        </button>
      </div>

      {/* BDE Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                  BDE
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                  Contact
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                  Total Surveys
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                  Today
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                  Avg Score
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                  Last Active
                </th>
                <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredBDEs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-foreground">No team members found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search ? "Try a different search term" : "Add your first BDE to get started"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBDEs.map((bde) => {
                  const stats = getBDEStats(bde.id);
                  return (
                    <tr
                      key={bde.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      {/* Avatar + Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {bde.avatar ? (
                            /* eslint-disable-next-line @next/next/no-img-element -- dynamic avatar */
                            <img
                              src={bde.avatar}
                              alt={bde.name}
                              className="h-9 w-9 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold text-muted-foreground">
                              {getInitials(bde.name)}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">{bde.name}</p>
                            <p className="text-xs text-muted-foreground sm:hidden">{bde.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-sm text-foreground">{bde.email}</p>
                        {bde.phone && (
                          <p className="text-xs text-muted-foreground">{bde.phone}</p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <Badge variant={bde.active ? "success" : "danger"} dot>
                          {bde.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>

                      {/* Total Surveys */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">
                            {totalSurveys(bde)}
                          </span>
                        </div>
                      </td>

                      {/* Today's Surveys */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span
                          className={cn(
                            "text-sm font-medium tabular-nums",
                            stats.surveysToday > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-400 dark:text-zinc-500"
                          )}
                        >
                          {stats.surveysToday}
                        </span>
                      </td>

                      {/* Avg Lead Score */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {stats.avgLeadScore > 0 ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                              scoreColorClass(stats.avgLeadScore),
                              scoreBgClass(stats.avgLeadScore)
                            )}
                          >
                            {stats.avgLeadScore}%
                          </span>
                        ) : (
                          <span className="text-sm text-zinc-400 dark:text-zinc-500">
                            -
                          </span>
                        )}
                      </td>

                      {/* Last Active */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(bde.updatedAt)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionMenu(actionMenu === bde.id ? null : bde.id);
                            }}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>

                          {actionMenu === bde.id && (
                            <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg py-1">
                              <Link
                                href={`/admin/surveys?bde=${bde.id}`}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                              >
                                <Eye className="h-4 w-4" />
                                View Surveys
                              </Link>
                              <button
                                onClick={() => handleToggleActive(bde)}
                                className={cn(
                                  "flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors",
                                  bde.active
                                    ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                                    : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                )}
                              >
                                {bde.active ? (
                                  <>
                                    <UserX className="h-4 w-4" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-4 w-4" />
                                    Activate
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New BDE Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New BDE"
        description="Create a new Business Development Executive account."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter full name"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Enter email address"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Phone</label>
            <input
              type="tel"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Enter phone number"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Set a password"
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        <ModalFooter>
          <button
            onClick={() => setShowAddModal(false)}
            className="px-4 py-2.5 text-sm font-medium text-foreground rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddBDE}
            disabled={!newName || !newEmail || !newPassword || submitting}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2.5 font-medium transition-colors text-sm disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Add BDE
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
