"use client";

import React from "react";
import { cn } from "@/lib/utils";

/* ---------- Card Root ---------- */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)]",
        "shadow-[var(--shadow-card)] transition-all duration-[180ms] ease-out",
        hoverable &&
          "hover:shadow-[var(--shadow-card-hover)] hover:border-[var(--border-hover)]",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

/* ---------- Card Header ---------- */
export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-[var(--space-1)] px-[var(--space-6)] pt-[var(--space-6)] pb-[var(--space-4)]",
        className
      )}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

/* ---------- Card Title ---------- */
export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, children, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        "text-[var(--text-md)] font-semibold leading-[var(--leading-tight)] tracking-[var(--tracking-tight)]",
        className
      )}
      {...props}
    >
      {children}
    </h3>
  )
);
CardTitle.displayName = "CardTitle";

/* ---------- Card Description ---------- */
export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  CardDescriptionProps
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-[var(--text-sm)] text-[var(--foreground-secondary)]", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

/* ---------- Card Content ---------- */
export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("px-[var(--space-6)] pb-[var(--space-6)]", className)}
      {...props}
    />
  )
);
CardContent.displayName = "CardContent";

/* ---------- Card Footer ---------- */
export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center px-[var(--space-6)] pb-[var(--space-6)] pt-0",
        className
      )}
      {...props}
    />
  )
);
CardFooter.displayName = "CardFooter";
