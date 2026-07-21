"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
  useEffect,
} from "react";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */
type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id" | "exiting">) => void;
  dismiss: (id: string) => void;
}

/* ---------- Context ---------- */
const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* ---------- Icons & styles ---------- */
const typeConfig: Record<
  ToastType,
  { icon: React.ElementType; className: string }
> = {
  success: {
    icon: CheckCircle2,
    className: "text-[var(--success)]",
  },
  error: {
    icon: AlertCircle,
    className: "text-[var(--danger)]",
  },
  warning: {
    icon: AlertTriangle,
    className: "text-[var(--warning)]",
  },
  info: {
    icon: Info,
    className: "text-[var(--info)]",
  },
};

/* ---------- ToastItem ---------- */
function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const { icon: Icon, className: iconClass } = typeConfig[t.type];
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const dur = t.duration ?? 5000;
    if (dur > 0) {
      timerRef.current = setTimeout(() => onDismiss(t.id), dur);
    }
    return () => clearTimeout(timerRef.current);
  }, [t.id, t.duration, onDismiss]);

  return (
    <div
      className={cn(
        "relative w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border)]",
        "bg-[var(--popover)] text-[var(--popover-foreground)] shadow-[var(--shadow-lg)]",
        "p-[var(--space-4)] flex items-start gap-[var(--space-3)]",
        t.exiting ? "toast-exit" : "toast-enter"
      )}
      role="alert"
      aria-live="assertive"
    >
      <Icon className={cn("size-5 shrink-0 mt-0.5", iconClass)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-[var(--text-sm)] font-medium text-[var(--foreground)] leading-snug">
          {t.title}
        </p>
        {t.description && (
          <p className="mt-[var(--space-1)] text-[var(--text-xs)] text-[var(--foreground-secondary)] leading-relaxed">
            {t.description}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(t.id)}
        className={cn(
          "shrink-0 inline-flex items-center justify-center size-6 rounded-[var(--radius-sm)]",
          "text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]",
          "transition-colors duration-[var(--transition-fast)]"
        )}
        aria-label="Dismiss notification"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/* ---------- ToastProvider ---------- */
export interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback(
    (opts: Omit<Toast, "id" | "exiting">) => {
      const id = `toast-${++counter.current}-${Date.now()}`;
      setToasts((prev) => [...prev, { ...opts, id }]);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {/* Toast Container */}
      <div
        className="fixed bottom-[var(--space-6)] right-[var(--space-6)] z-[100] flex flex-col-reverse gap-[var(--space-3)] pointer-events-none"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
