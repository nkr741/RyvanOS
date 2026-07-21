"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface ProgressRingProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  size?: number;
  strokeWidth?: number;
  showValue?: boolean;
  color?: string;
  trackColor?: string;
  label?: string;
}

export const ProgressRing = React.forwardRef<HTMLDivElement, ProgressRingProps>(
  (
    {
      className,
      value,
      size = 80,
      strokeWidth = 6,
      showValue = true,
      color = "var(--primary)",
      trackColor = "var(--border)",
      label,
      ...props
    },
    ref
  ) => {
    const clamped = Math.min(100, Math.max(0, value));
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (clamped / 100) * circumference;

    return (
      <div
        ref={ref}
        className={cn("relative inline-flex items-center justify-center", className)}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || `${clamped}% progress`}
        {...props}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 600ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          />
        </svg>

        {showValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-[var(--text-md)] font-semibold text-[var(--foreground)] leading-none"
              style={{ fontSize: size * 0.22 }}
            >
              {clamped}%
            </span>
            {label && (
              <span
                className="text-[var(--foreground-tertiary)] mt-0.5 leading-none"
                style={{ fontSize: Math.max(9, size * 0.12) }}
              >
                {label}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

ProgressRing.displayName = "ProgressRing";
