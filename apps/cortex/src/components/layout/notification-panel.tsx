"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, AlertCircle, Award, Info, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */

interface Notification {
  id: string;
  type: "reminder" | "overdue" | "achievement" | "system";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}

export interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

/* ---------- Helpers ---------- */

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

const typeIcons: Record<Notification["type"], React.ElementType> = {
  reminder: Bell,
  overdue: AlertCircle,
  achievement: Award,
  system: Info,
};

const typeIconColors: Record<Notification["type"], string> = {
  reminder: "text-[var(--primary)]",
  overdue: "text-[var(--danger)]",
  achievement: "text-[var(--warning)]",
  system: "text-[var(--info)]",
};

/* ---------- Component ---------- */

export function NotificationPanel({ open, onClose, onUnreadCountChange }: NotificationPanelProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  /* ---------- Fetch ---------- */

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/notifications?limit=20", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      onUnreadCountChange?.(data.unreadCount ?? 0);
    } catch (err) {
      console.error("[notification-panel] Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ---------- Click outside ---------- */

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    // Delay listener attachment to avoid the opening click triggering close
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onClose]);

  /* ---------- Escape key ---------- */

  useEffect(() => {
    if (!open) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  /* ---------- Mark single read ---------- */

  async function markRead(notification: Notification) {
    if (!notification.read) {
      try {
        const token = localStorage.getItem("token");
        await fetch("/api/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "mark_read", id: notification.id }),
        });

        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
        );
        const newCount = Math.max(0, unreadCount - 1);
        setUnreadCount(newCount);
        onUnreadCountChange?.(newCount);
      } catch (err) {
        console.error("[notification-panel] Failed to mark notification as read:", err);
      }
    }

    if (notification.actionUrl) {
      onClose();
      router.push(notification.actionUrl);
    }
  }

  /* ---------- Mark all read ---------- */

  async function markAllRead() {
    setMarkingAllRead(true);
    try {
      const token = localStorage.getItem("token");
      await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "mark_all_read" }),
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      onUnreadCountChange?.(0);
    } catch (err) {
      console.error("[notification-panel] Failed to mark all notifications as read:", err);
    } finally {
      setMarkingAllRead(false);
    }
  }

  /* ---------- Render ---------- */

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className={cn(
        "absolute right-0 top-full mt-[var(--space-2)] z-50",
        "w-[380px] max-w-[calc(100vw-var(--space-8))]",
        "rounded-[var(--radius-lg)] border border-[var(--border)]",
        "bg-[var(--popover)] text-[var(--popover-foreground)]",
        "shadow-[var(--shadow-xl)]",
        "notification-panel-enter",
      )}
      role="dialog"
      aria-label="Notifications"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--space-4)] py-[var(--space-3)] border-b border-[var(--border)]">
        <div className="flex items-center gap-[var(--space-2)]">
          <span className="text-[var(--text-sm)] font-semibold text-[var(--foreground)]">
            Notifications
          </span>
          {unreadCount > 0 && (
            <span
              className={cn(
                "inline-flex items-center justify-center",
                "min-w-[20px] h-5 px-1.5 rounded-[var(--radius-full)]",
                "bg-[var(--primary)] text-[var(--primary-foreground)]",
                "text-[11px] font-semibold leading-none",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-[var(--space-1)]">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAllRead}
              className={cn(
                "inline-flex items-center gap-[var(--space-1)] px-[var(--space-2)] py-1",
                "rounded-[var(--radius-sm)]",
                "text-[var(--text-xs)] font-medium text-[var(--primary)]",
                "hover:bg-[var(--primary-light)] transition-colors duration-[var(--transition-fast)]",
                "disabled:opacity-50 disabled:pointer-events-none",
              )}
            >
              {markingAllRead ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CheckCheck className="size-3" />
              )}
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className={cn(
              "inline-flex items-center justify-center size-7 rounded-[var(--radius-sm)]",
              "text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]",
              "transition-colors duration-[var(--transition-fast)]",
            )}
            aria-label="Close notifications"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          /* Loading state */
          <div className="flex items-center justify-center py-[var(--space-12)]">
            <Loader2 className="size-6 animate-spin text-[var(--foreground-tertiary)]" />
          </div>
        ) : notifications.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-[var(--space-12)] px-[var(--space-6)]">
            <div
              className={cn(
                "flex items-center justify-center size-12 rounded-[var(--radius-full)]",
                "bg-[var(--muted)] mb-[var(--space-3)]",
              )}
            >
              <Bell className="size-5 text-[var(--foreground-tertiary)]" />
            </div>
            <p className="text-[var(--text-sm)] font-medium text-[var(--foreground)]">
              All caught up!
            </p>
            <p className="text-[var(--text-xs)] text-[var(--foreground-tertiary)] mt-[var(--space-1)]">
              No notifications.
            </p>
          </div>
        ) : (
          /* Notification list */
          <div className="py-[var(--space-1)]">
            {notifications.map((notification) => {
              const Icon = typeIcons[notification.type];
              const iconColor = typeIconColors[notification.type];

              return (
                <button
                  key={notification.id}
                  onClick={() => markRead(notification)}
                  className={cn(
                    "w-full flex items-start gap-[var(--space-3)]",
                    "px-[var(--space-4)] py-[var(--space-3)]",
                    "text-left transition-colors duration-[var(--transition-fast)]",
                    "hover:bg-[var(--muted)]",
                    notification.actionUrl && "cursor-pointer",
                    !notification.read && "bg-[var(--primary-light)]/30",
                  )}
                >
                  {/* Unread dot */}
                  <div className="flex items-center pt-1.5 shrink-0">
                    <span
                      className={cn(
                        "size-2 rounded-full shrink-0 transition-colors",
                        notification.read ? "bg-transparent" : "bg-[var(--primary)]",
                      )}
                    />
                  </div>

                  {/* Type icon */}
                  <div
                    className={cn(
                      "flex items-center justify-center size-8 rounded-[var(--radius)] shrink-0 mt-0.5",
                      "bg-[var(--muted)]",
                    )}
                  >
                    <Icon className={cn("size-4", iconColor)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-[var(--text-sm)] leading-snug truncate",
                        notification.read
                          ? "font-normal text-[var(--foreground-secondary)]"
                          : "font-medium text-[var(--foreground)]",
                      )}
                    >
                      {notification.title}
                    </p>
                    <p className="text-[var(--text-xs)] text-[var(--foreground-tertiary)] leading-relaxed mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    <span className="text-[11px] text-[var(--foreground-tertiary)] mt-[var(--space-1)] block">
                      {relativeTime(notification.createdAt)}
                    </span>
                  </div>

                  {/* Read indicator */}
                  {notification.read && (
                    <div className="shrink-0 pt-1">
                      <Check className="size-3.5 text-[var(--foreground-tertiary)]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
