"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar, SidebarTrigger } from "./sidebar";
import { NotificationPanel } from "./notification-panel";
import { Bell } from "lucide-react";

interface AppShellProps {
  role: "admin" | "bde";
  children: React.ReactNode;
}

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/survey/vendor": "New Vendor Survey",
  "/dashboard/survey/rider": "New Rider Survey",
  "/dashboard/followups": "CRM",
  "/dashboard/reports": "My Reports",
  "/admin/workspace": "Workspace",
  "/admin/assistant": "Cortex Assistant",
  "/admin/org": "Agent Org",
  "/admin/field": "Field Tracking",
  "/admin": "Dashboard",
  "/admin/growth": "Growth Engine",
  "/admin/discovery": "Discovery Hub",
  "/admin/leads": "AI SDR — Leads",
  "/admin/intelligence": "Account Intelligence",
  "/admin/relationships": "Relationship Intelligence",
  "/admin/execution": "Execution Engine",
  "/admin/missions": "Missions",
  "/admin/pipeline": "Revenue Pipeline",
  "/admin/surveys": "All Surveys",
  "/admin/heatmap": "Heat Map",
  "/admin/analytics": "Analytics",
  "/admin/competitors": "Competitors",
  "/admin/reports": "Reports",
  "/admin/team": "Team",
};

export function AppShell({ role, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [mounted, setMounted] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR hydration guard
    setMounted(true);
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.replace("/");
      return;
    }
    try {
      const user = JSON.parse(userStr);
      setUserName(user.name || "User");
    } catch {
      router.replace("/");
    }
  }, [router]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
      </div>
    );
  }

  const pageTitle = pageTitles[pathname]
    || (pathname.startsWith("/admin/growth/") ? "Company Detail" : "Cortex Growth");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        role={role}
        currentPath={pathname}
        userName={userName}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <SidebarTrigger onClick={() => setMobileOpen(true)} />
            <h1 className="text-lg font-semibold text-foreground">
              {pageTitle}
            </h1>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
              )}
            </button>
            <NotificationPanel
              open={notifOpen}
              onClose={() => setNotifOpen(false)}
              onUnreadCountChange={setUnreadCount}
            />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
