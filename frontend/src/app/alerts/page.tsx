"use client";

/**
 * Alerts Page — /alerts
 *
 * Global alert feed with status (open/resolved) and severity filtering.
 */

import { useState } from "react";
import { Bell, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAlerts } from "@/hooks/useAlerts";
import { AlertBadge } from "@/components/dashboard/AlertBadge";
import { cn } from "@/lib/utils";
import type { Alert } from "@/lib/api";

type StatusFilter   = "all" | "open" | "resolved";
type SeverityFilter = "all" | "critical" | "warning";

export default function AlertsPage() {
  const { alerts, openCount, isLoading, refetch } = useAlerts(200);
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  const filtered = alerts.filter((a: Alert) => {
    const statusOk   = statusFilter   === "all" || a.status   === statusFilter;
    const severityOk = severityFilter === "all" || a.severity === severityFilter;
    return statusOk && severityOk;
  });

  const resolvedCount = alerts.filter((a: Alert) => a.status === "resolved").length;

  return (
    <div className="px-8 py-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-sm text-surface-muted mt-1">
            <span className="text-red-400 font-medium">{openCount} open</span>
            {" · "}
            <span className="text-green-400 font-medium">{resolvedCount} resolved</span>
          </p>
        </div>
        <button onClick={refetch} className="btn-secondary">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3">
        {/* Status filters */}
        <div className="flex gap-1 bg-surface-card border border-surface-border rounded-lg p-1">
          {(["all", "open", "resolved"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-all",
                statusFilter === f
                  ? "bg-surface-hover text-white shadow-sm"
                  : "text-surface-muted hover:text-white"
              )}
            >
              {f === "open"     && <AlertTriangle  className="h-3 w-3 text-red-400"   />}
              {f === "resolved" && <CheckCircle2   className="h-3 w-3 text-green-400" />}
              {f}
              <span className="text-xs text-surface-muted">
                ({f === "all"
                  ? alerts.length
                  : f === "open"
                  ? openCount
                  : resolvedCount})
              </span>
            </button>
          ))}
        </div>

        {/* Severity filters */}
        <div className="flex gap-1 bg-surface-card border border-surface-border rounded-lg p-1">
          {(["all", "critical", "warning"] as SeverityFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSeverityFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-all",
                severityFilter === f
                  ? f === "critical"
                    ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
                    : f === "warning"
                    ? "bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/30"
                    : "bg-surface-hover text-white shadow-sm"
                  : "text-surface-muted hover:text-white"
              )}
            >
              {f}
              <span className="ml-1.5 text-xs text-surface-muted">
                ({f === "all"
                  ? alerts.length
                  : alerts.filter((a: Alert) => a.severity === f).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-card border border-surface-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((a: Alert) => <AlertBadge key={a.id} alert={a} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Bell className="h-12 w-12 text-surface-muted mb-4" />
          <h3 className="text-white font-semibold mb-1">No alerts</h3>
          <p className="text-sm text-surface-muted">
            No alerts match the selected filters.
          </p>
        </div>
      )}
    </div>
  );
}
