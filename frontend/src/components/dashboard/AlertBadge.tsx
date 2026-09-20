"use client";

/**
 * AlertBadge — Displays a single alert entry with acknowledge support.
 *
 * Open alerts show an "Acknowledge" button. Clicking it opens an inline
 * note input. On submit the PATCH /acknowledge endpoint is called and
 * the local state is updated optimistically.
 *
 * Visually distinguishes:
 *   - open critical        → red border + icon
 *   - open warning         → yellow border + icon
 *   - open + acknowledged  → indigo tint (same border, "Acked" badge)
 *   - resolved             → muted border + green checkmark
 */

import { useState } from "react";
import { cn, metricTypeLabel } from "@/lib/utils";
import {
  AlertTriangle, AlertOctagon, Clock, CheckCircle2,
  ShieldCheck, MessageSquare, X, Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { alertsApi, type Alert } from "@/lib/api";

interface AlertBadgeProps {
  alert: Alert;
  /** Called after a successful acknowledge so parent can refresh state */
  onAcknowledge?: (updated: Alert) => void;
}

const SEVERITY_STYLES = {
  critical: {
    container: "border-red-500/30 bg-red-500/5",
    badge:     "bg-red-500/20 text-red-400",
    Icon:      AlertOctagon,
    iconColor: "text-red-400",
  },
  warning: {
    container: "border-yellow-500/30 bg-yellow-500/5",
    badge:     "bg-yellow-500/20 text-yellow-400",
    Icon:      AlertTriangle,
    iconColor: "text-yellow-400",
  },
};

export function AlertBadge({ alert: initialAlert, onAcknowledge }: AlertBadgeProps) {
  const [alert, setAlert]         = useState<Alert>(initialAlert);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote]           = useState("");
  const [isAcking, setIsAcking]   = useState(false);
  const [ackError, setAckError]   = useState<string | null>(null);

  const isResolved    = alert.status === "resolved";
  const isAcknowledged = alert.acknowledged;

  const handleAcknowledge = async () => {
    setIsAcking(true);
    setAckError(null);
    try {
      const updated = await alertsApi.acknowledge(alert.id, note || undefined);
      setAlert(updated);
      setShowNoteInput(false);
      setNote("");
      onAcknowledge?.(updated);
    } catch {
      setAckError("Failed to acknowledge. Please try again.");
    } finally {
      setIsAcking(false);
    }
  };

  // ── Resolved ──────────────────────────────────────────────────────────────
  if (isResolved) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-surface-border bg-surface-card/50 p-4 opacity-60 transition-all duration-200">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide bg-green-500/10 text-green-500">
              resolved
            </span>
            <span className="text-xs font-medium text-surface-muted">
              {alert.host_name ? `${alert.host_name} · ` : ""}
              {metricTypeLabel(alert.metric_type)}
            </span>
            <span className="text-xs text-surface-muted ml-auto flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(alert.triggered_at), { addSuffix: true })}
            </span>
          </div>
          <p className="mt-1 text-sm text-surface-muted truncate">{alert.message}</p>
        </div>
      </div>
    );
  }

  // ── Open (acknowledged or not) ────────────────────────────────────────────
  const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.warning;
  const { Icon, iconColor } = style;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all duration-200",
        isAcknowledged
          ? "border-indigo-500/30 bg-indigo-500/5"
          : style.container
      )}
    >
      {/* Main row */}
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", isAcknowledged ? "text-indigo-400" : iconColor)} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Severity badge */}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                isAcknowledged ? "bg-indigo-500/20 text-indigo-400" : style.badge
              )}
            >
              {alert.severity}
            </span>

            {/* Acknowledged badge */}
            {isAcknowledged && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                <ShieldCheck className="h-3 w-3" />
                Acked by {alert.acknowledged_by}
              </span>
            )}

            <span className="text-xs font-medium text-white">
              {alert.host_name ? `${alert.host_name} · ` : ""}
              {metricTypeLabel(alert.metric_type)}
            </span>

            <span className="text-xs text-surface-muted ml-auto flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(alert.triggered_at), { addSuffix: true })}
            </span>
          </div>

          <p className="mt-1 text-sm text-surface-muted">{alert.message}</p>

          {/* Ack note */}
          {isAcknowledged && alert.ack_note && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-indigo-300/80 italic">
              <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
              {alert.ack_note}
            </p>
          )}
        </div>

        {/* Acknowledge button — only shown on unacknowledged open alerts */}
        {!isAcknowledged && (
          <button
            onClick={() => setShowNoteInput((v) => !v)}
            className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Acknowledge
          </button>
        )}
      </div>

      {/* Inline note input */}
      {showNoteInput && !isAcknowledged && (
        <div className="mt-3 ml-7 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAcknowledge()}
              placeholder="Add a note (optional)…"
              maxLength={512}
              className="flex-1 rounded-lg border border-surface-border bg-surface-DEFAULT px-3 py-1.5 text-xs text-white placeholder-surface-muted focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <button
              onClick={handleAcknowledge}
              disabled={isAcking}
              className="flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              {isAcking
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <ShieldCheck className="h-3 w-3" />}
              {isAcking ? "Saving…" : "Confirm"}
            </button>
            <button
              onClick={() => { setShowNoteInput(false); setNote(""); }}
              className="rounded-lg p-1.5 text-surface-muted hover:text-white hover:bg-surface-hover transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {ackError && <p className="text-xs text-red-400">{ackError}</p>}
        </div>
      )}
    </div>
  );
}
