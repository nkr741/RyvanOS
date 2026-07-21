"use client";

import React from "react";
import { cn } from "@/lib/utils";

/* ---------- Input ---------- */
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, icon, id, type, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-[var(--space-2)]">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[var(--text-sm)] font-medium text-[var(--foreground)]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-tertiary)] [&>svg]:size-4">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            className={cn(
              "flex h-9 w-full rounded-[var(--radius)] border border-[var(--input-border)] bg-[var(--input-background)]",
              "px-3 py-2 text-[var(--text-base)] text-[var(--foreground)]",
              "placeholder:text-[var(--input-placeholder)]",
              "transition-[border-color,box-shadow] duration-[var(--transition-fast)]",
              "hover:border-[var(--border-hover)]",
              "focus:outline-none focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              icon && "pl-9",
              error &&
                "border-[var(--danger)] focus:border-[var(--danger)] focus:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]",
              className
            )}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={
              error
                ? `${inputId}-error`
                : helperText
                ? `${inputId}-helper`
                : undefined
            }
            {...props}
          />
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            className="text-[var(--text-xs)] text-[var(--danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
        {!error && helperText && (
          <p
            id={`${inputId}-helper`}
            className="text-[var(--text-xs)] text-[var(--foreground-tertiary)]"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

/* ---------- Textarea ---------- */
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-[var(--space-2)]">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[var(--text-sm)] font-medium text-[var(--foreground)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "flex min-h-[80px] w-full rounded-[var(--radius)] border border-[var(--input-border)] bg-[var(--input-background)]",
            "px-3 py-2 text-[var(--text-base)] text-[var(--foreground)]",
            "placeholder:text-[var(--input-placeholder)]",
            "transition-[border-color,box-shadow] duration-[var(--transition-fast)]",
            "hover:border-[var(--border-hover)]",
            "focus:outline-none focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-y",
            error &&
              "border-[var(--danger)] focus:border-[var(--danger)] focus:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]",
            className
          )}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={
            error
              ? `${inputId}-error`
              : helperText
              ? `${inputId}-helper`
              : undefined
          }
          {...props}
        />
        {error && (
          <p
            id={`${inputId}-error`}
            className="text-[var(--text-xs)] text-[var(--danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
        {!error && helperText && (
          <p
            id={`${inputId}-helper`}
            className="text-[var(--text-xs)] text-[var(--foreground-tertiary)]"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

/* ---------- Select ---------- */
export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    { className, label, error, helperText, id, options, placeholder, ...props },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="space-y-[var(--space-2)]">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[var(--text-sm)] font-medium text-[var(--foreground)]"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          className={cn(
            "flex h-9 w-full rounded-[var(--radius)] border border-[var(--input-border)] bg-[var(--input-background)]",
            "px-3 py-2 text-[var(--text-base)] text-[var(--foreground)]",
            "transition-[border-color,box-shadow] duration-[var(--transition-fast)]",
            "hover:border-[var(--border-hover)]",
            "focus:outline-none focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.1)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat",
            "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
            "pr-8",
            error &&
              "border-[var(--danger)] focus:border-[var(--danger)] focus:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]",
            className
          )}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={
            error
              ? `${inputId}-error`
              : helperText
              ? `${inputId}-helper`
              : undefined
          }
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p
            id={`${inputId}-error`}
            className="text-[var(--text-xs)] text-[var(--danger)]"
            role="alert"
          >
            {error}
          </p>
        )}
        {!error && helperText && (
          <p
            id={`${inputId}-helper`}
            className="text-[var(--text-xs)] text-[var(--foreground-tertiary)]"
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";
