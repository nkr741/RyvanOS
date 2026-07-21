"use client";

import React from "react";
import { cn } from "@/lib/utils";

const variantStyles = {
  success:
    "bg-[var(--success-light)] text-[var(--success-foreground)] border-[var(--success)]/20",
  warning:
    "bg-[var(--warning-light)] text-[var(--warning-foreground)] border-[var(--warning)]/20",
  danger:
    "bg-[var(--danger-light)] text-[var(--danger-foreground)] border-[var(--danger)]/20",
  info: "bg-[var(--info-light)] text-[var(--info-foreground)] border-[var(--info)]/20",
  neutral:
    "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
} as const;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variantStyles;
  dot?: boolean;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", dot = false, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-2.5 py-0.5",
        "text-[var(--text-xs)] font-medium leading-none whitespace-nowrap select-none",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("size-1.5 rounded-full shrink-0", {
            "bg-[var(--success)]": variant === "success",
            "bg-[var(--warning)]": variant === "warning",
            "bg-[var(--danger)]": variant === "danger",
            "bg-[var(--info)]": variant === "info",
            "bg-[var(--foreground-tertiary)]": variant === "neutral",
          })}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
);

Badge.displayName = "Badge";
