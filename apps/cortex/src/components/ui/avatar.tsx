"use client";

import React from "react";
import { cn } from "@/lib/utils";

const sizeStyles = {
  sm: "size-8 text-[var(--text-xs)]",
  md: "size-10 text-[var(--text-sm)]",
  lg: "size-12 text-[var(--text-base)]",
  xl: "size-16 text-[var(--text-lg)]",
} as const;

const statusColors = {
  online: "bg-[var(--success)]",
  offline: "bg-[var(--foreground-tertiary)]",
  busy: "bg-[var(--danger)]",
  away: "bg-[var(--warning)]",
} as const;

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: keyof typeof sizeStyles;
  status?: keyof typeof statusColors;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, name, size = "md", status, ...props }, ref) => {
    const initials = name
      ? name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : "?";

    const [imgError, setImgError] = React.useState(false);
    const showImage = src && !imgError;

    return (
      <div
        ref={ref}
        className={cn("relative inline-flex shrink-0", className)}
        {...props}
      >
        <div
          className={cn(
            "relative inline-flex items-center justify-center rounded-full overflow-hidden",
            "bg-[var(--muted)] text-[var(--muted-foreground)] font-medium select-none",
            "ring-2 ring-[var(--background)]",
            sizeStyles[size]
          )}
          role="img"
          aria-label={alt || name || "User avatar"}
        >
          {showImage ? (
            /* eslint-disable-next-line @next/next/no-img-element -- dynamic src with error fallback */
            <img
              src={src}
              alt={alt || name || "Avatar"}
              className="size-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span aria-hidden="true">{initials}</span>
          )}
        </div>

        {status && (
          <span
            className={cn(
              "absolute bottom-0 right-0 block rounded-full ring-2 ring-[var(--background)]",
              statusColors[status],
              size === "sm" && "size-2",
              size === "md" && "size-2.5",
              size === "lg" && "size-3",
              size === "xl" && "size-3.5"
            )}
            aria-label={`Status: ${status}`}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";
