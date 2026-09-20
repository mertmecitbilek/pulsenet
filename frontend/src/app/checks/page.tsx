"use client";

/**
 * Checks Page — /checks
 *
 * Every service check across all hosts in one table, with state filters
 * and admin actions (run now / pause / delete).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity, Globe, Plug, Radar, RefreshCw, Play, Pause, Trash2, Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { checksApi, hostsApi, type Host, type ServiceCheck } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const REFRESH_MS = 10_000;
const TYPE_ICON = { ping: Activity, http: Globe, tcp: Plug } as const;

type StateFilter = "all" | "up" | "down" | "paused";

function checkState(c: ServiceCheck): Exclude<StateFilter, "all"> | "pending" {
  if (!c.enabled) return "paused";
  if (c.state === "unknown") return "pending";
  return c.state;
}

const STATE_STYLE: Record<string, string> = {
  up:      "bg-green-500/10 text-green-400 border-green-500/20",
  down:    "bg-red-500/10 text-red-400 border-red-500/20",
  paused:  "bg-surface-border/40 text-surface-muted border-surface-border",
  pending: "bg-surface-border/40 text-surface-muted border-surface-border",
};

export default function ChecksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [checks, setChecks] = useState<ServiceCheck[]>([]);
  const [hosts, setHosts]   = useState<Record<string, Host>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<StateFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [checkList, hostList] = await Promise.all([checksApi.list(), hostsApi.list()]);
      setChecks(checkList);
      setHosts(Object.fromEntries(hostList.map((h) => [h.id, h])));
      setError(null);
    } catch {
      setError("Failed to load checks.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const replace = (updated: ServiceCheck) =>
    setChecks((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

  const counts = {
    all: checks.length,
    up: checks.filter((c) => checkState(c) === "up").length,
    down: checks.filter((c) => checkState(c) === "down").length,
    paused: checks.filter((c) => checkState(c) === "paused").length,
  };
  const filtered = filter === "all" ? checks : checks.filter((c) => checkState(c) === filter);

  const target = (c: ServiceCheck) => {
    if (c.type === "http") return c.target ?? "";
    const host = c.target ?? hosts[c.host_id]?.ip_address ?? "";
    return c.type === "tcp" ? `${host}:${c.port}` : host;
  };

  return (
    <div className="px-8 py-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Service Checks</h1>
          <p className="text-sm text-surface-muted mt-1">
            Ping, HTTP and TCP port checks across all devices
          </p>
        </div>
        <button onClick={refresh} className="btn-secondary">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1 bg-surface-card border border-surface-border rounded-lg p-1 w-fit">
        {(["all", "up", "down", "paused"] as StateFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-all",
              filter === f
                ? f === "down"
                  ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30"
                  : "bg-surface-hover text-white shadow-sm"
                : "text-surface-muted hover:text-white"
            )}
          >
            {f}
            <span className="ml-1.5 text-xs text-surface-muted">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-card border border-surface-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radar className="h-12 w-12 text-surface-muted mb-4" />
          <h3 className="text-white font-semibold mb-1">
            {checks.length === 0 ? "No service checks yet" : "Nothing matches this filter"}
          </h3>
          <p className="text-sm text-surface-muted">
            {checks.length === 0 ? (
              <>Add a device from the <Link href="/hosts" className="text-brand-400 hover:underline">Devices</Link> page to start checking availability.</>
            ) : (
              "Try a different state filter."
            )}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-surface-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-card/50">
                {["Check", "Device", "Target", "State", "Response", "24h uptime", "Last run", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-surface-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border bg-surface-card">
              {filtered.map((c) => {
                const TypeIcon = TYPE_ICON[c.type];
                const state = checkState(c);
                const busy = busyId === c.id;
                return (
                  <tr key={c.id} className={cn("group transition-colors hover:bg-surface-hover", !c.enabled && "opacity-60")}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10">
                          <TypeIcon className="h-4 w-4 text-brand-400" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{c.name}</p>
                          <p className="text-xs text-surface-muted uppercase">{c.type}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/hosts/${c.host_id}`} className="text-brand-400 hover:underline">
                        {hosts[c.host_id]?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-surface-muted max-w-[220px] truncate">
                      {target(c)}
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize", STATE_STYLE[state])}>
                        {state}
                      </span>
                      {c.enabled && c.last_error && (
                        <p className="mt-1 max-w-[200px] truncate text-xs text-red-400" title={c.last_error}>
                          {c.last_error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 font-mono text-surface-muted">
                      {c.last_response_ms != null ? `${c.last_response_ms.toFixed(1)} ms` : "—"}
                    </td>
                    <td className="px-4 py-4 font-mono text-surface-muted">
                      {c.uptime_24h != null ? `${c.uptime_24h.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-4 text-xs text-surface-muted">
                      {c.last_checked_at
                        ? formatDistanceToNow(new Date(c.last_checked_at), { addSuffix: true })
                        : "Never"}
                    </td>
                    <td className="px-4 py-4">
                      {isAdmin && (
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            title="Run now"
                            disabled={busy || !c.enabled}
                            onClick={() => act(c.id, async () => replace(await checksApi.runNow(c.id)))}
                            className="rounded-lg p-1.5 text-surface-muted hover:bg-surface-border hover:text-white transition-colors disabled:opacity-40"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          </button>
                          <button
                            title={c.enabled ? "Pause" : "Resume"}
                            disabled={busy}
                            onClick={() => act(c.id, async () => replace(await checksApi.update(c.id, { enabled: !c.enabled })))}
                            className="rounded-lg p-1.5 text-surface-muted hover:bg-surface-border hover:text-white transition-colors disabled:opacity-40"
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
                              });
                            }}
                            className="rounded-lg p-1.5 text-surface-muted hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
