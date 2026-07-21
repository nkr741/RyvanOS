"use client";

import React from "react";
import { cn } from "@/lib/utils";

/* ---------- Base Skeleton ---------- */
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("skeleton", className)} {...props} />
  )
);
Skeleton.displayName = "Skeleton";

/* ---------- Skeleton Text ---------- */
export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
  lastLineWidth?: string;
}

export const SkeletonText = React.forwardRef<HTMLDivElement, SkeletonTextProps>(
  ({ className, lines = 3, lastLineWidth = "60%", ...props }, ref) => (
    <div
      ref={ref}
      className={cn("space-y-[var(--space-3)]", className)}
      {...props}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-3 rounded-[var(--radius-sm)]"
          style={{
            width: i === lines - 1 ? lastLineWidth : "100%",
          }}
        />
      ))}
    </div>
  )
);
SkeletonText.displayName = "SkeletonText";

/* ---------- Skeleton Avatar ---------- */
export interface SkeletonAvatarProps
  extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
}

export const SkeletonAvatar = React.forwardRef<
  HTMLDivElement,
  SkeletonAvatarProps
>(({ className, size = 40, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("skeleton shrink-0 rounded-full", className)}
    style={{ width: size, height: size }}
    {...props}
  />
));
SkeletonAvatar.displayName = "SkeletonAvatar";

/* ---------- Skeleton Card ---------- */
export type SkeletonCardProps = React.HTMLAttributes<HTMLDivElement>;

export const SkeletonCard = React.forwardRef<HTMLDivElement, SkeletonCardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-[var(--space-6)]",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-[var(--space-4)] mb-[var(--space-4)]">
        <SkeletonAvatar size={40} />
        <div className="flex-1 space-y-[var(--space-2)]">
          <Skeleton className="h-3.5 w-1/3 rounded-[var(--radius-sm)]" />
          <Skeleton className="h-3 w-1/2 rounded-[var(--radius-sm)]" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  )
);
SkeletonCard.displayName = "SkeletonCard";
