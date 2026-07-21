"use client";

import React, { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-var(--space-8))]",
} as const;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: keyof typeof sizeStyles;
  title?: string;
  description?: string;
  className?: string;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
}

export function Modal({
  open,
  onClose,
  children,
  size = "md",
  title,
  description,
  className,
  closeOnOverlay = true,
  closeOnEscape = true,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape) {
        onClose();
      }
    },
    [onClose, closeOnEscape]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-[var(--space-4)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      aria-describedby={description ? "modal-description" : undefined}
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-[var(--overlay)] modal-overlay-enter"
        onClick={closeOnOverlay ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Content */}
      <div
        className={cn(
          "relative z-10 w-full rounded-[var(--radius-lg)] bg-[var(--popover)] text-[var(--popover-foreground)]",
          "border border-[var(--border)] shadow-[var(--shadow-xl)]",
          "modal-content-enter",
          "max-h-[85vh] flex flex-col",
          sizeStyles[size],
          className
        )}
      >
        {/* Header */}
        {(title || description) && (
          <div className="flex items-start gap-[var(--space-4)] px-[var(--space-6)] pt-[var(--space-6)] pb-[var(--space-4)]">
            <div className="flex-1 min-w-0">
              {title && (
                <h2
                  id="modal-title"
                  className="text-[var(--text-lg)] font-semibold text-[var(--foreground)] leading-[var(--leading-tight)]"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id="modal-description"
                  className="mt-[var(--space-1)] text-[var(--text-sm)] text-[var(--foreground-secondary)]"
                >
                  {description}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className={cn(
                "shrink-0 inline-flex items-center justify-center size-8 rounded-[var(--radius-sm)]",
                "text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]",
                "transition-colors duration-[var(--transition-fast)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
              )}
              aria-label="Close dialog"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-[var(--space-6)] pb-[var(--space-6)]">
          {!title && !description && (
            <div className="absolute right-[var(--space-4)] top-[var(--space-4)]">
              <button
                onClick={onClose}
                className={cn(
                  "inline-flex items-center justify-center size-8 rounded-[var(--radius-sm)]",
                  "text-[var(--foreground-tertiary)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]",
                  "transition-colors duration-[var(--transition-fast)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                )}
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---------- Modal Footer ---------- */
export type ModalFooterProps = React.HTMLAttributes<HTMLDivElement>;

export const ModalFooter = React.forwardRef<HTMLDivElement, ModalFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-end gap-[var(--space-3)] pt-[var(--space-4)]",
        "border-t border-[var(--border)] mt-[var(--space-4)] -mx-[var(--space-6)] px-[var(--space-6)] pb-0 pt-[var(--space-4)]",
        className
      )}
      {...props}
    />
  )
);
ModalFooter.displayName = "ModalFooter";
