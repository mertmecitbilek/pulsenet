"use client";

/**
 * MetricCard — Animated card displaying a single system metric.
 *
 * Shows an icon, label, current value, percentage bar, and
 * a subtle glow that intensifies as the value approaches 100%.
 */

import { cn, getBarColor, getStatusColor } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: number;          // 0–100 percentage, drives the bar and colours
  /** Overrides the "NN.N%" headline (e.g. an uptime of "3d 4h 20m") */
  displayValue?: string;
  subtitle?: string;      // e.g. "14.2 GB / 32 GB"
  Icon: LucideIcon;
  isLoading?: boolean;
}

export function MetricCard({
  label,
  value,
  displayValue,
  subtitle,
  Icon,
  isLoading = false,
}: MetricCardProps) {
  const barColor = getBarColor(value);
  // A custom headline (uptime) is not a severity, so keep it neutral
  const textColor = displayValue ? "text-white" : getStatusColor(value);

  return (
    <div
      className={cn(
        "relative rounded-2xl border border-surface-border bg-surface-card p-6",
        "transition-all duration-300 hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-500/10",
        "animate-slide-up"
      )}
    >
      {/* Background glow — intensity scales with the value */}
      <div
        className="absolute inset-0 rounded-2xl opacity-20 transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse at top left, ${
            value >= 90 ? "rgba(239,68,68,0.3)" :
            value >= 75 ? "rgba(245,158,11,0.3)" :
            "rgba(99,102,241,0.2)"
          }, transparent 60%)`,
        }}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 ring-1 ring-brand-500/20">
              <Icon className="h-5 w-5 text-brand-400" />
            </div>
            <span className="text-sm font-medium text-surface-muted uppercase tracking-wider">
              {label}
            </span>
          </div>
        </div>

        {/* Value */}
        {isLoading ? (
          <div className="h-8 w-20 rounded-lg bg-surface-border animate-pulse mb-4" />
        ) : (
        <div className={cn("text-4xl font-bold mb-1 font-mono", textColor)}>
            {displayValue ?? (
              <>
                {(value ?? 0).toFixed(1)}
                <span className="text-xl text-surface-muted">%</span>
              </>
            )}
          </div>
        )}

        {subtitle && (
          <p className="text-xs text-surface-muted mb-4">{subtitle}</p>
        )}

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-surface-border overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              barColor
            )}
            style={{ width: isLoading ? "0%" : `${Math.min(value, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
