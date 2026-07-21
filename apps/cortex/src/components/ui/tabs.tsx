"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */
export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

/* ---------- TabGroup ---------- */
export interface TabGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  variant?: "underline" | "pills";
}

export function TabGroup({
  tabs,
  activeTab,
  onTabChange,
  variant = "underline",
  className,
  ...props
}: TabGroupProps) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const updateIndicator = useCallback(() => {
    const activeEl = tabRefs.current.get(activeTab);
    if (activeEl && tabListRef.current) {
      const listRect = tabListRef.current.getBoundingClientRect();
      const tabRect = activeEl.getBoundingClientRect();
      setIndicator({
        left: tabRect.left - listRect.left,
        width: tabRect.width,
      });
    }
  }, [activeTab]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener("resize", updateIndicator);
    return () => window.removeEventListener("resize", updateIndicator);
  }, [updateIndicator]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledTabs = tabs.filter((t) => !t.disabled);
    const currentIdx = enabledTabs.findIndex((t) => t.id === activeTab);
    let nextIdx = currentIdx;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIdx = (currentIdx + 1) % enabledTabs.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIdx = (currentIdx - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIdx = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIdx = enabledTabs.length - 1;
    }

    if (nextIdx !== currentIdx) {
      const nextTab = enabledTabs[nextIdx];
      onTabChange(nextTab.id);
      tabRefs.current.get(nextTab.id)?.focus();
    }
  };

  const isUnderline = variant === "underline";

  return (
    <div
      ref={tabListRef}
      className={cn(
        "relative flex",
        isUnderline
          ? "border-b border-[var(--border)] gap-0"
          : "bg-[var(--muted)] rounded-[var(--radius)] p-1 gap-0.5",
        className
      )}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      {...props}
    >
      {/* Animated indicator */}
      {isUnderline ? (
        <div
          className="absolute bottom-0 h-0.5 bg-[var(--primary)] rounded-full transition-all duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
          aria-hidden="true"
        />
      ) : (
        <div
          className="absolute top-1 h-[calc(100%-8px)] bg-[var(--card)] rounded-[var(--radius-sm)] shadow-[var(--shadow-xs)] border border-[var(--border)] transition-all duration-200 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
          aria-hidden="true"
        />
      )}

      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => {
            if (el) tabRefs.current.set(tab.id, el);
          }}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          disabled={tab.disabled}
          onClick={() => !tab.disabled && onTabChange(tab.id)}
          className={cn(
            "relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none",
            "text-[var(--text-sm)] font-medium transition-colors duration-[var(--transition-fast)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]",
            "disabled:opacity-40 disabled:pointer-events-none",
            isUnderline
              ? cn(
                  "px-[var(--space-4)] py-[var(--space-3)]",
                  activeTab === tab.id
                    ? "text-[var(--foreground)]"
                    : "text-[var(--foreground-tertiary)] hover:text-[var(--foreground-secondary)]"
                )
              : cn(
                  "px-[var(--space-3)] py-[var(--space-1)] rounded-[var(--radius-sm)]",
                  activeTab === tab.id
                    ? "text-[var(--foreground)]"
                    : "text-[var(--foreground-tertiary)] hover:text-[var(--foreground-secondary)]"
                ),
            "[&>svg]:size-4"
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- TabPanel ---------- */
export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tabId: string;
  activeTab: string;
}

export function TabPanel({
  tabId,
  activeTab,
  className,
  children,
  ...props
}: TabPanelProps) {
  if (tabId !== activeTab) return null;

  return (
    <div
      id={`tabpanel-${tabId}`}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      className={cn("animate-fade-in outline-none", className)}
      {...props}
    >
      {children}
    </div>
  );
}
