import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format uptime seconds into a human-readable string. */
export function formatUptime(seconds: number | null | undefined): string {
  if (seconds == null) return "N/A";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Format bytes into a human-readable MB/GB string. */
export function formatBytes(mb: number | null | undefined): string {
  if (mb == null) return "N/A";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

/** Return Tailwind colour class based on a percentage value. */
export function getStatusColor(value: number): string {
  if (value >= 90) return "text-red-500";
  if (value >= 75) return "text-yellow-400";
  return "text-green-400";
}

/** Return ring/bar colour based on severity. */
export function getBarColor(value: number): string {
  if (value >= 90) return "bg-red-500";
  if (value >= 75) return "bg-yellow-400";
  return "bg-brand-500";
}

const METRIC_TYPE_LABELS: Record<string, string> = {
  cpu: "CPU",
  memory: "Memory",
  disk: "Disk",
  host_down: "Host Down",
  check_down: "Service Check",
};

/** Human-readable name for an alert's metric_type. */
export function metricTypeLabel(metricType: string): string {
  return METRIC_TYPE_LABELS[metricType] ?? metricType;
}
