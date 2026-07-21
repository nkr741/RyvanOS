"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  ArrowUpDown,
  Loader2,
  AlertCircle,
  X,
  ClipboardList,
  Download,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

/* ---------- Types ---------- */

interface VendorSurvey {
  id: string;
  businessName: string;
  ownerName: string;
  mobile: string;
  category: string;
  leadScore: number | null;
  leadStatus: string;
  createdAt: string;
  bde: { id: string; name: string; email: string } | null;
}

interface RiderSurvey {
  id: string;
  riderName: string;
  phone: string;
  vehicleType: string | null;
  leadScore: number | null;
  leadStatus: string;
  createdAt: string;
  bde: { id: string; name: string; email: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type Tab = "vendor" | "rider";
type SortField = "date" | "score" | "name";
type SortDir = "asc" | "desc";

/* ---------- Constants ---------- */

const STATUSES = [
  { value: "", label: "All Statuses" },
  { value: "new", label: "Lead (New)" },
  { value: "qualified", label: "Qualified" },
  { value: "interested", label: "Interested" },
  { value: "negotiation", label: "Negotiation" },
  { value: "onboarded", label: "Onboarded" },
  { value: "active_merchant", label: "Active Merchant" },
  { value: "follow_up", label: "Follow-up (Legacy)" },
  { value: "not_interested", label: "Not Interested" },
];

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

function getToken() {
  return localStorage.getItem("token") || "";
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    new: "Lead",
    qualified: "Qualified",
    interested: "Interested",
    negotiation: "Negotiation",
    onboarded: "Onboarded",
    active_merchant: "Active Merchant",
    follow_up: "Follow-up",
    not_interested: "Not Interested",
  };
  return labels[status] || status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function scoreColorClass(score: number | null) {
  if (score === null) return "text-zinc-400";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  if (score >= 40) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBgClass(score: number | null) {
  if (score === null) return "bg-zinc-100 dark:bg-zinc-800";
  if (score >= 80) return "bg-emerald-500/10";
  if (score >= 60) return "bg-amber-500/10";
  if (score >= 40) return "bg-orange-500/10";
  return "bg-red-500/10";
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "qualified":
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20";
    case "interested":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
    case "negotiation":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20";
    case "onboarded":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
    case "active_merchant":
      return "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20";
    case "follow_up":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
    case "not_interested":
      return "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20";
    default:
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20";
  }
}

/* ---------- Main Page ---------- */
export default function AllSurveysPage() {
  const [activeTab, setActiveTab] = useState<Tab>("vendor");
  const [vendorSurveys, setVendorSurveys] = useState<VendorSurvey[]>([]);
  const [riderSurveys, setRiderSurveys] = useState<RiderSurvey[]>([]);
  const [vendorPagination, setVendorPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [riderPagination, setRiderPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Pages
  const [vendorPage, setVendorPage] = useState(1);
  const [riderPage, setRiderPage] = useState(1);

  const currentPage = activeTab === "vendor" ? vendorPage : riderPage;
  const setCurrentPage = activeTab === "vendor" ? setVendorPage : setRiderPage;
  const pagination = activeTab === "vendor" ? vendorPagination : riderPagination;

  const fetchVendorSurveys = useCallback(
    async (page: number) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "20");
        if (search) params.set("search", search);
        if (statusFilter) params.set("status", statusFilter);
        if (categoryFilter) params.set("category", categoryFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        const res = await fetch(`/api/surveys/vendor?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error("Failed to fetch vendor surveys");
        const data = await res.json();
        setVendorSurveys(data.surveys || []);
        setVendorPagination(
          data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 }
        );
      } catch {
        setError("Failed to load vendor surveys");
      } finally {
        setIsLoading(false);
      }
    },
    [search, statusFilter, categoryFilter, dateFrom, dateTo]
  );

  const fetchRiderSurveys = useCallback(
    async (page: number) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", "20");
        if (search) params.set("search", search);
        if (statusFilter) params.set("status", statusFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        const res = await fetch(`/api/surveys/rider?${params.toString()}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error("Failed to fetch rider surveys");
        const data = await res.json();
        setRiderSurveys(data.surveys || []);
        setRiderPagination(
          data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 }
        );
      } catch {
        setError("Failed to load rider surveys");
      } finally {
        setIsLoading(false);
      }
    },
    [search, statusFilter, dateFrom, dateTo]
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeTab === "vendor") {
      fetchVendorSurveys(vendorPage);
    } else {
      fetchRiderSurveys(riderPage);
    }
  }, [activeTab, vendorPage, riderPage, fetchVendorSurveys, fetchRiderSurveys]);

  useEffect(() => {
    setVendorPage(1);
    setRiderPage(1);
  }, [search, statusFilter, categoryFilter, dateFrom, dateTo]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Client-side sorting (within the fetched page)
  function sortSurveys<T extends VendorSurvey | RiderSurvey>(surveys: T[]): T[] {
    return [...surveys].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "score":
          cmp = (a.leadScore ?? 0) - (b.leadScore ?? 0);
          break;
        case "name": {
          const nameA = "businessName" in a ? a.businessName : (a as RiderSurvey).riderName;
          const nameB = "businessName" in b ? b.businessName : (b as RiderSurvey).riderName;
          cmp = nameA.localeCompare(nameB);
          break;
        }
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  const sortedVendorSurveys = sortSurveys(vendorSurveys);
  const sortedRiderSurveys = sortSurveys(riderSurveys);

  function handleExport() {
    const surveys = activeTab === "vendor" ? sortedVendorSurveys : sortedRiderSurveys;
    if (surveys.length === 0) return;

    const headers = activeTab === "vendor"
      ? ["Business Name", "Owner", "Phone", "Category", "Lead Score", "Status", "BDE", "Date"]
      : ["Rider Name", "Phone", "Vehicle", "Lead Score", "Status", "BDE", "Date"];

    const rows = surveys.map((s) => {
      if (activeTab === "vendor") {
        const v = s as VendorSurvey;
        return [v.businessName, v.ownerName, v.mobile, v.category, v.leadScore ?? "", formatStatus(v.leadStatus), v.bde?.name ?? "", formatDate(v.createdAt)];
      }
      const r = s as RiderSurvey;
      return [r.riderName, r.phone, r.vehicleType ?? "", r.leadScore ?? "", formatStatus(r.leadStatus), r.bde?.name ?? "", formatDate(r.createdAt)];
    });

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab}-surveys-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => setError("")} className="ml-auto">
            <X className="h-4 w-4 text-red-400" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            All Surveys
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {pagination.total} total surveys
          </p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg px-4 py-2.5 font-medium transition-colors text-sm shrink-0"
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("vendor")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "vendor"
              ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          )}
        >
          Vendor Surveys
        </button>
        <button
          onClick={() => setActiveTab("rider")}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "rider"
              ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
          )}
        >
          Rider Surveys
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={
              activeTab === "vendor"
                ? "Search by business name, owner, phone..."
                : "Search by rider name, phone..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors border shrink-0",
            showFilters
              ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
              : "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          )}
        >
          <Filter className="h-4 w-4" />
          Filters
        </button>
      </div>

      {/* Filter Dropdowns */}
      {showFilters && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {activeTab === "vendor" && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
                  Category
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
                Date From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">
                Date To
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
          {(statusFilter || categoryFilter || dateFrom || dateTo) && (
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => {
                  setStatusFilter("");
                  setCategoryFilter("");
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sort Controls */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500 dark:text-zinc-400">Sort by:</span>
        {(["date", "score", "name"] as SortField[]).map((field) => (
          <button
            key={field}
            onClick={() => toggleSort(field)}
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 rounded-md transition-colors",
              sortField === field
                ? "bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
                : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            )}
          >
            {field.charAt(0).toUpperCase() + field.slice(1)}
            {sortField === field && (
              <ArrowUpDown className="h-3 w-3" />
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : activeTab === "vendor" ? (
            /* Vendor Table */
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Business Name
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                    Category
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    Owner Phone
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Lead Score
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                    BDE
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                    Date
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedVendorSurveys.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">
                        No vendor surveys found
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {search || statusFilter || categoryFilter
                          ? "Try adjusting your filters"
                          : "No surveys have been submitted yet"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedVendorSurveys.map((survey) => (
                    <tr
                      key={survey.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {survey.businessName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {survey.ownerName}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-foreground capitalize">
                          {survey.category?.replace(/_/g, " ") || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-foreground">
                          {survey.mobile}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                            scoreColorClass(survey.leadScore),
                            scoreBgClass(survey.leadScore)
                          )}
                        >
                          {survey.leadScore ?? "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                            statusBadgeVariant(survey.leadStatus)
                          )}
                        >
                          {formatStatus(survey.leadStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm text-foreground">
                          {survey.bde?.name || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(survey.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/surveys/vendor/${survey.id}`}
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          <span className="hidden sm:inline">View</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* Rider Table */
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Rider Name
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                    Vehicle
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                    Phone
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Lead Score
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                    BDE
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                    Date
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRiderSurveys.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <ClipboardList className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-sm font-medium text-foreground">
                        No rider surveys found
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {search || statusFilter
                          ? "Try adjusting your filters"
                          : "No surveys have been submitted yet"}
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedRiderSurveys.map((survey) => (
                    <tr
                      key={survey.id}
                      className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-foreground">
                          {survey.riderName}
                        </p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-sm text-foreground capitalize">
                          {survey.vehicleType?.replace(/_/g, " ") || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-foreground">
                          {survey.phone}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                            scoreColorClass(survey.leadScore),
                            scoreBgClass(survey.leadScore)
                          )}
                        >
                          {survey.leadScore ?? "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                            statusBadgeVariant(survey.leadStatus)
                          )}
                        >
                          {formatStatus(survey.leadStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-sm text-foreground">
                          {survey.bde?.name || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(survey.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/surveys/rider/${survey.id}`}
                          className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          <span className="hidden sm:inline">View</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 px-4 py-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total}{" "}
              results)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={() =>
                  setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))
                }
                disabled={currentPage >= pagination.totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
