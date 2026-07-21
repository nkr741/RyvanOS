"use client";

import React, { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateRange {
  from: string;
  to: string;
}

interface Preset {
  label: string;
  getValue: () => DateRange;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getPresets(): Preset[] {
  return [
    {
      label: "Today",
      getValue: () => {
        const d = toISODate(new Date());
        return { from: d, to: d };
      },
    },
    {
      label: "Last 7 days",
      getValue: () => {
        const to = new Date();
        const from = new Date(to);
        from.setDate(from.getDate() - 6);
        return { from: toISODate(from), to: toISODate(to) };
      },
    },
    {
      label: "Last 14 days",
      getValue: () => {
        const to = new Date();
        const from = new Date(to);
        from.setDate(from.getDate() - 13);
        return { from: toISODate(from), to: toISODate(to) };
      },
    },
    {
      label: "Last 30 days",
      getValue: () => {
        const to = new Date();
        const from = new Date(to);
        from.setDate(from.getDate() - 29);
        return { from: toISODate(from), to: toISODate(to) };
      },
    },
    {
      label: "Last 90 days",
      getValue: () => {
        const to = new Date();
        const from = new Date(to);
        from.setDate(from.getDate() - 89);
        return { from: toISODate(from), to: toISODate(to) };
      },
    },
    {
      label: "All time",
      getValue: () => ({ from: "", to: "" }),
    },
  ];
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const presets = getPresets();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeLabel =
    !value.from && !value.to
      ? "All time"
      : `${formatDate(value.from)} – ${formatDate(value.to)}`;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-sm font-medium",
          "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50",
          "text-zinc-700 dark:text-zinc-300",
          "hover:border-zinc-300 dark:hover:border-zinc-600",
          "transition-colors duration-150",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        )}
      >
        <Calendar className="size-4 text-zinc-400" />
        <span>{activeLabel}</span>
        <ChevronDown
          className={cn(
            "size-3.5 text-zinc-400 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-full mt-2 z-50 w-72",
            "rounded-xl border border-zinc-200 dark:border-zinc-700",
            "bg-white dark:bg-zinc-800 shadow-xl",
            "animate-in fade-in-0 zoom-in-95 duration-150"
          )}
        >
          <div className="p-2 space-y-0.5">
            {presets.map((preset) => {
              const pv = preset.getValue();
              const isActive =
                pv.from === value.from && pv.to === value.to;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChange(preset.getValue());
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors duration-100",
                    isActive
                      ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="border-t border-zinc-100 dark:border-zinc-700 p-3 space-y-2">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Custom range
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={value.from}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
                className={cn(
                  "flex-1 h-8 px-2 text-xs rounded-lg border",
                  "border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700/50",
                  "text-zinc-700 dark:text-zinc-300",
                  "focus:outline-none focus:border-blue-500"
                )}
              />
              <span className="text-xs text-zinc-400">–</span>
              <input
                type="date"
                value={value.to}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
                className={cn(
                  "flex-1 h-8 px-2 text-xs rounded-lg border",
                  "border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700/50",
                  "text-zinc-700 dark:text-zinc-300",
                  "focus:outline-none focus:border-blue-500"
                )}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
