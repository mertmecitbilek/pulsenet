"use client";

/**
 * ServiceChecks — ping / HTTP / TCP checks for one host.
 *
 * Lists the host's checks with live state, response time and 24h uptime.
 * Admins can add, run, pause/resume and delete checks. Clicking a row
 * expands a response-time chart of the latest runs.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Activity, Globe, Plug, Plus, Play, Pause, Trash2, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { checksApi, type CheckResult, type ServiceCheck } from "@/lib/api";
import { MetricChart } from "@/components/dashboard/MetricChart";
import { AddCheckModal } from "@/components/hosts/AddCheckModal";
import { cn } from "@/lib/utils";

const REFRESH_MS = 10_000;

const TYPE_ICON = { ping: Activity, http: Globe, tcp: Plug } as const;

const STATE_STYLE: Record<ServiceCheck["state"], { label: string; cls: string }> = {
  up:      { label: "Up",      cls: "bg-green-500/10 text-green-400 border-green-500/20" },
  down:    { label: "Down",    cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  unknown: { label: "Pending", cls: "bg-surface-border/40 text-surface-muted border-surface-border" },
};

function describeTarget(c: ServiceCheck, hostIp: string): string {
  if (c.type === "http") return c.target ?? "";
  const host = c.target ?? hostIp;
  return c.type === "tcp" ? `${host}:${c.port}` : host;
}

interface ServiceChecksProps {
  hostId: string;
  hostIp: string;
  isAdmin: boolean;
}

export function ServiceChecks({ hostId, hostIp, isAdmin }: ServiceChecksProps) {
  const [checks, setChecks]       = useState<ServiceCheck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [results, setResults]     = useState<CheckResult[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setChecks(await checksApi.list(hostId));
    } finally {
      setIsLoading(false);
    }
  }, [hostId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Load / refresh results for the expanded row
  useEffect(() => {
    if (!expandedId) return;
    let cancelled = false;
    const load = () =>
      checksApi.results(expandedId, 120).then((r) => { if (!cancelled) setResults(r); }).catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [expandedId]);

  const replace = (updated: ServiceCheck) =>
    setChecks((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
    } catch (err: any) {
      setActionError(err.response?.data?.detail ?? "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleExpand = (id: string) => {
    setResults([]);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const downCount = checks.filter((c) => c.state === "down").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted">
          Service Checks
        </h2>
        <div className="flex items-center gap-3">
          {checks.length > 0 && (
            <span className="text-xs text-surface-muted">
              <span className={downCount > 0 ? "text-red-400 font-medium" : "text-green-400 font-medium"}>
                {checks.length - downCount}/{checks.length} healthy
              </span>
            </span>
          )}
          {isAdmin && (
            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-surface-border bg-surface-card px-3 py-1.5 text-xs font-medium text-surface-muted hover:text-white hover:bg-surface-hover transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              Add check
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-xs text-red-400">
          {actionError}
        </div>
      )}

      {isLoading ? (
        <div className="h-16 rounded-xl bg-surface-card border border-surface-border animate-pulse" />
      ) : checks.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-8 text-center">
          <p className="text-sm text-surface-muted">
            No service checks yet.{isAdmin ? " Add a ping, HTTP or TCP check to monitor availability." : ""}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-surface-border bg-surface-card divide-y divide-surface-border overflow-hidden">
          {checks.map((c) => {
            const TypeIcon = TYPE_ICON[c.type];
            const state = c.enabled ? STATE_STYLE[c.state] : { label: "Paused", cls: STATE_STYLE.unknown.cls };
            const isExpanded = expandedId === c.id;
            const busy = busyId === c.id;

            return (
              <div key={c.id} className={cn(!c.enabled && "opacity-60")}>
                <div className="flex items-center gap-4 px-4 py-3">
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left"
                  >
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-surface-muted flex-shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-surface-muted flex-shrink-0" />}
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                      <TypeIcon className="h-4 w-4 text-brand-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{c.name}</p>
                      <p className="text-xs text-surface-muted font-mono truncate">
                        {c.type.toUpperCase()} · {describeTarget(c, hostIp)}
                      </p>
                    </div>
                  </button>

                  <div className="hidden md:block text-right w-24">
                    <p className="text-sm font-mono text-white">
                      {c.last_response_ms != null ? `${c.last_response_ms.toFixed(1)} ms` : "—"}
                    </p>
                    <p className="text-xs text-surface-muted">response</p>
                  </div>
                  <div className="hidden md:block text-right w-20">
                    <p className="text-sm font-mono text-white">
                      {c.uptime_24h != null ? `${c.uptime_24h.toFixed(1)}%` : "—"}
                    </p>
                    <p className="text-xs text-surface-muted">24h uptime</p>
                  </div>

                  <span className={cn("inline-flex w-20 justify-center rounded-full border px-2.5 py-1 text-xs font-medium", state.cls)}>
                    {state.label}
                  </span>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        title="Run now"
                        disabled={busy || !c.enabled}
                        onClick={() => act(c.id, async () => replace(await checksApi.runNow(c.id)))}
                        className="rounded-lg p-1.5 text-surface-muted hover:text-white hover:bg-surface-border transition-colors disabled:opacity-40"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button
                        title={c.enabled ? "Pause" : "Resume"}
                        disabled={busy}
                        onClick={() => act(c.id, async () => replace(await checksApi.update(c.id, { enabled: !c.enabled })))}
                        className="rounded-lg p-1.5 text-surface-muted hover:text-white hover:bg-surface-border transition-colors disabled:opacity-40"
                      >
                        {c.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 text-green-400" />}
                      </button>
                      <button
                        title="Delete"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Delete check "${c.name}"?`)) return;
                          act(c.id, async () => {
                            await checksApi.delete(c.id);
                            setChecks((prev) => prev.filter((x) => x.id !== c.id));
                            if (expandedId === c.id) setExpandedId(null);
                          });
                        }}
                        className="rounded-lg p-1.5 text-surface-muted hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Failure reason line */}
                {c.enabled && c.last_error && (
                  <p className="px-4 pb-3 -mt-1 ml-[3.75rem] text-xs text-red-400">
                    {c.last_error}
                    {c.last_checked_at && (
                      <span className="text-surface-muted">
                        {" "}· checked {formatDistanceToNow(new Date(c.last_checked_at), { addSuffix: true })}
                      </span>
                    )}
                  </p>
                )}

                {/* Expanded: response time chart */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    {results.length > 1 ? (
                      <>
                        <MetricChart
                          metrics={results.map((r) => ({ timestamp: r.timestamp, response_ms: r.response_ms }))}
                          dataKey="response_ms"
                          label="Response"
                          color="#38bdf8"
                          unit=" ms"
                          percentAxis={false}
                          title="Response time (last runs)"
                        />
                        <p className="mt-2 text-xs text-surface-muted">
                          {results.filter((r) => !r.success).length} failed of the last {results.length} runs · every {c.interval_seconds}s,
                          alert after {c.fail_threshold} failures
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-surface-muted py-4 text-center">Not enough results yet…</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddCheckModal
        hostId={hostId}
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={(created) => setChecks((prev) => [...prev, created])}
      />
    </div>
  );
}
