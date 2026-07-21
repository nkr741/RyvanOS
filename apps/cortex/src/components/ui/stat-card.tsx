"use client";

import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  description?: string;
}

export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, label, value, icon, trend, description, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)]",
        "p-[var(--space-6)] shadow-[var(--shadow-card)]",
        "transition-all duration-[180ms] ease-out",
        "hover:shadow-[var(--shadow-card-hover)]",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-[var(--space-4)]">
        <div className="space-y-[var(--space-1)] min-w-0">
          <p className="text-[var(--text-sm)] font-medium text-[var(--foreground-secondary)] truncate">
            {label}
          </p>
          <p className="text-[var(--text-2xl)] font-semibold tracking-[var(--tracking-tight)] text-[var(--foreground)]">
            {value}
          </p>
        </div>
        {icon && (
          <div
            className={cn(
              "flex items-center justify-center shrink-0",
              "size-10 rounded-[var(--radius)] bg-[var(--primary-light)]",
              "text-[var(--primary)] [&>svg]:size-5"
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
      </div>

      {(trend || description) && (
        <div className="mt-[var(--space-4)] flex items-center gap-[var(--space-2)]">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[var(--text-xs)] font-medium",
                trend.direction === "up"
                  ? "text-[var(--success)]"
                  : "text-[var(--danger)]"
              )}
            >
              {trend.direction === "up" ? (
                <TrendingUp className="size-3.5" aria-hidden="true" />
              ) : (
                <TrendingDown className="size-3.5" aria-hidden="true" />
              )}
              {trend.value}%
            </span>
          )}
          {description && (
            <span className="text-[var(--text-xs)] text-[var(--foreground-tertiary)]">
              {description}
            </span>
          )}
        </div>
      )}
    </div>
  )
);

StatCard.displayName = "StatCard";
