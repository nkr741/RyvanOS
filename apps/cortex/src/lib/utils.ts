import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatTime(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function getLeadScoreColor(score: number) {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-amber-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

export function getLeadScoreLabel(score: number) {
  if (score >= 80) return "High Potential";
  if (score >= 60) return "Medium Potential";
  if (score >= 40) return "Low Potential";
  return "Unlikely";
}

export function getStatusColor(status: string) {
  switch (status) {
    case "new":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "qualified":
      return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    case "interested":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "negotiation":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case "onboarded":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "active_merchant":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "follow_up":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "not_interested":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
  }
}

export function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    new: "Lead",
    qualified: "Qualified",
    interested: "Interested",
    negotiation: "Negotiation",
    onboarded: "Onboarded",
    active_merchant: "Active Merchant",
    follow_up: "Follow-up",
    not_interested: "Not Interested",
  };
  return labels[status] || status.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
