"use client";

import React from "react";
import { cn } from "@/lib/utils";

const variantStyles = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]",
  secondary:
    "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--border)] border border-[var(--border)]",
  ghost:
    "bg-transparent text-[var(--foreground-secondary)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
  danger:
    "bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]",
} as const;

const sizeStyles = {
  sm: "h-8 px-3 text-[var(--text-xs)] gap-1.5 rounded-[var(--radius-sm)]",
  md: "h-9 px-4 text-[var(--text-sm)] gap-2 rounded-[var(--radius)]",
  lg: "h-11 px-6 text-[var(--text-base)] gap-2.5 rounded-[var(--radius)]",
} as const;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      icon,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium whitespace-nowrap select-none",
          "transition-all duration-[180ms] ease-out",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
          "disabled:opacity-50 disabled:pointer-events-none",
          "active:scale-[0.98]",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <span className="spinner" aria-hidden="true" />
        ) : icon ? (
          <span className="shrink-0 [&>svg]:size-4" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
