"use client";

/**
 * Dashboard Page — /
 *
 * Overview: total hosts, open alerts, and a live metric summary
 * card for each registered host.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Server, Bell, Activity, ChevronRight,
  Radar
} from "lucide-react";
import { hostsApi, metricsApi, checksApi, type Host, type Metric } from "@/lib/api";
import { getStatusColor } from "@/lib/utils";
import { AlertBadge } from "@/components/dashboard/AlertBadge";
import { useAlerts } from "@/hooks/useAlerts";

// ── Stat summary card ────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  Icon: React.ElementType;
  accent?: string;
}

function StatCard({ label, value, Icon, accent = "brand" }: StatCardProps) {
  const accentMap: Record<string, string> = {
    brand:  "bg-brand-500/10 text-brand-400 ring-brand-500/20",
    green:  "bg-green-500/10 text-green-400 ring-green-500/20",
    red:    "bg-red-500/10   text-red-400   ring-red-500/20",
  };
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-card p-6 flex items-center gap-5 hover:border-brand-500/30 transition-all">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ring-1 flex-shrink-0 ${accentMap[accent]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-surface-muted">{label}</p>
      </div>
    </div>
  );
}

// ── Host metric row ──────────────────────────────────────────────────────────

interface CheckSummary {
  total: number;
  down: number;
}

interface HostRowProps {
  host: Host;
  metric: Metric | undefined;
  checks: CheckSummary | undefined;
}

function HostMetricRow({ host, metric, checks }: HostRowProps) {
  const isOnline = host.status === "online";
  return (
    <Link
      href={`/hosts/${host.id}`}
      className="flex items-center gap-4 rounded-xl border border-surface-border bg-surface-card px-5 py-4 hover:border-brand-500/40 hover:bg-surface-hover transition-all group"
    >
      {/* Status dot */}
      <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isOnline ? "bg-green-500 animate-pulse-slow" : "bg-surface-muted"}`} />

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white truncate">{host.name}</p>
        <p className="text-xs text-surface-muted font-mono">{host.ip_address}</p>
      </div>

      {/* Metrics */}
      {metric ? (
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center hidden sm:block">
            <p className={`font-mono font-semibold ${getStatusColor(metric.cpu_percent)}`}>
              {metric.cpu_percent.toFixed(1)}%
            </p>
            <p className="text-xs text-surface-muted">CPU</p>
          </div>
          <div className="text-center hidden md:block">
            <p className={`font-mono font-semibold ${getStatusColor(metric.memory_percent)}`}>
              {metric.memory_percent.toFixed(1)}%
            </p>
            <p className="text-xs text-surface-muted">MEM</p>
          </div>
          <div className="text-center hidden lg:block">
            <p className={`font-mono font-semibold ${getStatusColor(metric.disk_percent)}`}>
              {metric.disk_percent.toFixed(1)}%
            </p>
            <p className="text-xs text-surface-muted">DISK</p>
          </div>
        </div>
      ) : checks ? (
        // Agentless device — availability comes from its service checks
        <div className="text-center">
          <p className={`font-mono font-semibold ${checks.down > 0 ? "text-red-400" : "text-green-400"}`}>
            {checks.total - checks.down}/{checks.total}
          </p>
          <p className="text-xs text-surface-muted">CHECKS UP</p>
        </div>
      ) : (
        <span className="text-xs text-surface-muted">No data yet</span>
      )}

      <ChevronRight className="h-4 w-4 text-surface-muted group-hover:text-white transition-colors" />
    </Link>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [metricsMap, setMetricsMap] = useState<Record<string, Metric>>({});
  const [checksDown, setChecksDown] = useState(0);
  const [checksTotal, setChecksTotal] = useState(0);
  const [checksByHost, setChecksByHost] = useState<Record<string, CheckSummary>>({});
  const [isLoading, setIsLoading] = useState(true);
  const { alerts, openCount } = useAlerts(5);

  useEffect(() => {
    const load = async () => {
      try {
        const [hostList, summary, checks] = await Promise.all([
          hostsApi.list(),
          metricsApi.summary(),
          checksApi.list().catch(() => []),
        ]);
        setHosts(hostList);
        setChecksTotal(checks.length);
        setChecksDown(checks.filter((c) => c.state === "down").length);
        const byHost: Record<string, CheckSummary> = {};
        for (const c of checks) {
          const entry = (byHost[c.host_id] ??= { total: 0, down: 0 });
          entry.total += 1;
          if (c.state === "down") entry.down += 1;
        }
        setChecksByHost(byHost);
        // Build a host_id → latest metric map
        const map: Record<string, Metric> = {};
        summary.forEach((m) => { map[m.host_id] = m; });
        setMetricsMap(map);
      } finally {
        setIsLoading(false);
      }
    };
    load();
    // Refresh every 15 seconds
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const onlineCount = hosts.filter((h) => h.status === "online").length;

  return (
    <div className="px-8 py-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-surface-muted mt-1">
          Real-time overview of your infrastructure
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Devices" value={hosts.length}  Icon={Server}   accent="brand" />
        <StatCard label="Online"        value={onlineCount}   Icon={Activity} accent="green" />
        <StatCard label="Open Alerts"   value={openCount}     Icon={Bell}     accent={openCount > 0 ? "red" : "green"} />
        <StatCard
          label={checksTotal > 0 ? `Checks Down (of ${checksTotal})` : "Checks Down"}
          value={checksDown}
          Icon={Radar}
          accent={checksDown > 0 ? "red" : "green"}
        />
      </div>

      {/* Host list + Alerts side by side */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Host rows — takes 2/3 width */}
        <div className="xl:col-span-2 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted">
              Monitored Devices
            </h2>
            <Link href="/hosts" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
              View all →
            </Link>
          </div>
          {isLoading
            ? [...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-surface-card border border-surface-border animate-pulse" />
              ))
            : hosts.length > 0
            ? hosts.map((h) => (
                <HostMetricRow
                  key={h.id}
                  host={h}
                  metric={metricsMap[h.id]}
                  checks={checksByHost[h.id]}
                />
              ))
            : (
              <div className="text-center py-12 text-surface-muted text-sm">
                No devices yet.{" "}
                <Link href="/hosts" className="text-brand-400 hover:underline">Add one</Link>
              </div>
            )}
        </div>

        {/* Recent alerts — takes 1/3 width */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted mb-2">
            Recent Alerts
          </h2>
          {alerts.length > 0
            ? alerts.slice(0, 5).map((a) => <AlertBadge key={a.id} alert={a} />)
            : (
              <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-8 text-center">
                <Bell className="h-8 w-8 text-surface-muted mx-auto mb-2" />
                <p className="text-sm text-surface-muted">No alerts — all systems normal</p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
