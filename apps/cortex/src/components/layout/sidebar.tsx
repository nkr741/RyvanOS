"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  BarChart3,
  Users,
  FileText,
  Truck,
  Building2,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  GitBranch,
  Sparkles,
  Zap,
  Rocket,
  Search,
  Brain,
  Network,
  Play,
  Home,
  Mail,
  Bot,
  Radio,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const bdeNavItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "New Survey (Vendor)", href: "/dashboard/survey/vendor", icon: Building2 },
  { label: "New Survey (Rider)", href: "/dashboard/survey/rider", icon: Truck },
  { label: "CRM", href: "/dashboard/followups", icon: Users },
  { label: "My Reports", href: "/dashboard/reports", icon: FileText },
];

const adminNavItems: NavItem[] = [
  { label: "Workspace", href: "/admin/workspace", icon: Home },
  { label: "Cortex Assistant", href: "/admin/assistant", icon: Bot },
  { label: "Agent Org", href: "/admin/org", icon: Network },
  { label: "Field Tracking", href: "/admin/field", icon: Radio },
  { label: "Cortex Intelligence", href: "/admin", icon: Sparkles },
  { label: "Missions", href: "/admin/missions", icon: Zap },
  { label: "Growth Engine", href: "/admin/growth", icon: Rocket },
  { label: "Discovery Hub", href: "/admin/discovery", icon: Search },
  { label: "AI SDR — Leads", href: "/admin/leads", icon: Mail },
  { label: "Account Intelligence", href: "/admin/intelligence", icon: Brain },
  { label: "Relationships", href: "/admin/relationships", icon: Network },
  { label: "Execution Engine", href: "/admin/execution", icon: Play },
  { label: "Revenue Pipeline", href: "/admin/pipeline", icon: GitBranch },
  { label: "All Surveys", href: "/admin/surveys", icon: ClipboardList },
  { label: "Heat Map", href: "/admin/heatmap", icon: MapPin },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
  { label: "Competitors", href: "/admin/competitors", icon: Building2 },
  { label: "Reports", href: "/admin/reports", icon: FileText },
  { label: "Team", href: "/admin/team", icon: Users },
];

interface SidebarProps {
  role: "admin" | "bde";
  currentPath: string;
  userName: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({
  role,
  currentPath,
  userName,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const navItems = role === "admin" ? adminNavItems : bdeNavItems;

  async function handleLogout() {
    // Clear the server-side httpOnly cookie first (JS can't remove it itself),
    // then the client-side token/user, then redirect.
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Ignore network errors — still clear local state and redirect below.
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.replace("/");
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  const isActive = (href: string) => {
    if (href === "/dashboard" || href === "/admin") {
      return currentPath === href;
    }
    return currentPath.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar-bg transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className="text-background"
              >
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-sm font-semibold text-foreground">
              Cortex Growth
            </span>
          </div>
          <button
            onClick={onMobileClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-hover hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-sidebar-active-bg text-sidebar-active"
                    : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground"
                )}
              >
                <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-sidebar-active" : "")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-sidebar-border p-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-hover hover:text-foreground mb-1"
          >
            {theme === "dark" ? (
              <Sun className="h-[18px] w-[18px] shrink-0" />
            ) : (
              <Moon className="h-[18px] w-[18px] shrink-0" />
            )}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {getInitials(userName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {userName}
              </p>
              <p className="text-xs capitalize text-muted-foreground">{role}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function SidebarTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
