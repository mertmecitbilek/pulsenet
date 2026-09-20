"use client";

/**
 * Host Detail Page — /hosts/[id]
 *
 * Layout:
 *  ┌─ Header (name, status, IP/OS, Settings button)
 *  ├─ 4 live metric cards (CPU / Memory / Disk / Uptime)
 *  ├─ Time range selector (1h / 6h / 24h / 7d)
 *  ├─ 4 charts grid (CPU % | Memory % | Disk % | Network KB/s)
 *  └─ Alerts panel
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Cpu, MemoryStick, HardDrive, Clock,
  Wifi, WifiOff, Settings, Trash2, Radar,
} from "lucide-react";
import { hostsApi, alertsApi, type Host, type Alert } from "@/lib/api";
import { useMetrics } from "@/hooks/useMetrics";
import { useAuth } from "@/context/AuthContext";
import { MetricCard }               from "@/components/dashboard/MetricCard";
import { MetricChart }              from "@/components/dashboard/MetricChart";
import { AlertBadge }               from "@/components/dashboard/AlertBadge";
import { ConfigureThresholdsModal } from "@/components/dashboard/ConfigureThresholdsModal";
import { DeleteHostModal }          from "@/components/hosts/DeleteHostModal";
import { ServiceChecks }            from "@/components/hosts/ServiceChecks";
import { formatUptime, formatBytes, cn } from "@/lib/utils";

// ── Time range config ─────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: "1h",  sinceHours: 1  },
  { label: "6h",  sinceHours: 6  },
  { label: "24h", sinceHours: 24 },
  { label: "7d",  sinceHours: 168 },
] as const;

type TimeRangeHours = typeof TIME_RANGES[number]["sinceHours"];

// ── Network bytes → KB/s helper ───────────────────────────────────────────────
// The agent reports bytes transferred per collect interval (AGENT_COLLECT_INTERVAL).
const AGENT_INTERVAL_SEC = 10;
const ALERTS_REFRESH_MS = 30_000;

function bytesToKBps(bytes: number | null | undefined): number {
  if (bytes == null) return 0;
  return bytes / 1024 / AGENT_INTERVAL_SEC;
}

export default function HostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [host, setHost]                     = useState<Host | null>(null);
  const [alerts, setAlerts]                 = useState<Alert[]>([]);
  const [hostLoading, setHostLoading]       = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen]     = useState(false);
  const [isDeleting, setIsDeleting]         = useState(false);
  const [sinceHours, setSinceHours]         = useState<TimeRangeHours>(1);

  const { history, live, isLoading: metricsLoading } = useMetrics(id, 200, sinceHours);

  // Prefer live WebSocket value for summary cards; fall back to latest history point
  const latest = live ?? history[history.length - 1] ?? null;

  useEffect(() => {
    const load = async () => {
      try {
        const [h, a] = await Promise.all([
          hostsApi.get(id),
          alertsApi.forHost(id),
        ]);
        setHost(h);
        setAlerts(a);
      } finally {
        setHostLoading(false);
      }
    };
    load();

    // Keep the alert list fresh (open → resolved, new alerts)
    const timer = setInterval(() => {
      alertsApi.forHost(id).then(setAlerts).catch(() => {});
    }, ALERTS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [id]);

  if (hostLoading) {
    return (
      <div className="px-8 py-8 space-y-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-surface-card border border-surface-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (!host) {
    return (
      <div className="px-8 py-8 text-center">
        <p className="text-surface-muted">Host not found.</p>
      </div>
    );
  }

  const hasData = history.length > 1;
  // Never reported by an agent (e.g. a router monitored only via checks)
  const agentless = !metricsLoading && history.length === 0 && !latest && !host.last_seen_at;

  const netChartData = history.map((m) => ({
    timestamp: m.timestamp,
    net_kbps_sent: bytesToKBps(m.net_bytes_sent),
    net_kbps_recv: bytesToKBps(m.net_bytes_recv),
  }));

  // Ranges above 1h span days, so the X axis needs the date as well
  const timeFormat = sinceHours > 6 ? "MM-dd HH:mm" : "HH:mm:ss";

  return (
    <div className="px-8 py-8 space-y-6 animate-fade-in">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-surface-border text-surface-muted hover:text-white hover:bg-surface-hover transition-all"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{host.name}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              host.status === "online"
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-surface-border/40 text-surface-muted border border-surface-border"
            }`}>
              {host.status === "online" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {host.status}
            </span>
          </div>
          <p className="text-sm text-surface-muted font-mono mt-0.5">
            {host.ip_address} · {host.os ?? "Unknown OS"}
          </p>
        </div>

        {isAdmin && (<>
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-surface-muted hover:text-white border border-surface-border rounded-lg bg-surface-card hover:bg-surface-hover transition-all"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
        <button
          onClick={() => setIsDeleteOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-400 hover:text-white border border-red-500/30 rounded-lg bg-red-500/5 hover:bg-red-500/20 transition-all"
        >
          <Trash2 className="h-4 w-4" />
          Remove
        </button>
        </>)}
      </div>

      {/* Agent-based sections: only meaningful when the host reports metrics */}
      {!agentless && (
      <>
      {/* ── Live metric cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="CPU"
          value={latest?.cpu_percent ?? 0}
          Icon={Cpu}
          isLoading={metricsLoading && !latest}
        />
        <MetricCard
          label="Memory"
          value={latest?.memory_percent ?? 0}
          subtitle={
            latest
              ? `${formatBytes(latest.memory_used_mb)} / ${formatBytes(latest.memory_total_mb)}`
              : undefined
          }
          Icon={MemoryStick}
          isLoading={metricsLoading && !latest}
        />
        <MetricCard
          label="Disk"
          value={latest?.disk_percent ?? 0}
          subtitle={
            latest
              ? `${latest.disk_used_gb?.toFixed(1)} GB / ${latest.disk_total_gb?.toFixed(1)} GB`
              : undefined
          }
          Icon={HardDrive}
          isLoading={metricsLoading && !latest}
        />
        <MetricCard
          label="Uptime"
          // Bar fills over a 30-day reference window; the headline is the real duration
          value={latest ? Math.min(((latest.uptime_seconds ?? 0) / (30 * 86400)) * 100, 100) : 0}
          displayValue={latest ? formatUptime(latest.uptime_seconds) : "—"}
          subtitle="since last boot"
          Icon={Clock}
          isLoading={metricsLoading && !latest}
        />
      </div>

      {/* ── Time range selector ───────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-surface-muted font-medium mr-1">Time range:</span>
        <div className="flex gap-1 bg-surface-card border border-surface-border rounded-lg p-1">
          {TIME_RANGES.map(({ label, sinceHours: h }) => (
            <button
              key={label}
              onClick={() => setSinceHours(h)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                sinceHours === h
                  ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/30"
                  : "text-surface-muted hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-surface-muted ml-2">
          {history.length} data points
        </span>
      </div>

      {/* ── Charts ───────────────────────────────────────────────── */}
      {hasData ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MetricChart
            metrics={history}
            dataKey="cpu_percent"
            timeFormat={timeFormat}
            label="CPU"
            color="#6366f1"
            unit="%"
            title="CPU Usage"
            threshold={host.alert_cpu_threshold}
          />
          <MetricChart
            metrics={history}
            dataKey="memory_percent"
            timeFormat={timeFormat}
            label="Memory"
            color="#22c55e"
            unit="%"
            title="Memory Usage"
            threshold={host.alert_memory_threshold}
          />
          <MetricChart
            metrics={history}
            dataKey="disk_percent"
            timeFormat={timeFormat}
            label="Disk"
            color="#f59e0b"
            unit="%"
            title="Disk Usage"
            threshold={host.alert_disk_threshold}
          />
          <MetricChart
            metrics={netChartData}
            dataKey="net_kbps_sent"
            label="Out"
            color="#ec4899"
            secondary={{ dataKey: "net_kbps_recv", label: "In", color: "#38bdf8" }}
            unit=" KB/s"
            percentAxis={false}
            timeFormat={timeFormat}
            title="Network I/O (Out / In)"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-2xl border border-surface-border bg-surface-card h-48">
          <p className="text-surface-muted text-sm">
            Collecting data — charts will appear shortly…
          </p>
        </div>
      )}

      </>
      )}

      {agentless && (
        <div className="rounded-2xl border border-surface-border bg-surface-card px-6 py-5 flex items-start gap-3">
          <Radar className="h-5 w-5 text-brand-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">Agentless host</p>
            <p className="text-sm text-surface-muted mt-1">
              No agent has reported metrics for this host. Its availability is monitored
              through the service checks below (ping, HTTP, TCP port).
            </p>
          </div>
        </div>
      )}

      {/* ── Service checks ─────────────────────────────────────── */}
      <ServiceChecks hostId={host.id} hostIp={host.ip_address} isAdmin={isAdmin} />

      {/* ── Alerts panel ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted">
            Host Alerts
          </h2>
          <div className="flex gap-3 text-xs text-surface-muted">
            <span className="text-red-400 font-medium">
              {alerts.filter(a => a.status === "open").length} open
            </span>
            <span>
              {alerts.filter(a => a.status === "resolved").length} resolved
            </span>
          </div>
        </div>
        {alerts.length > 0
          ? alerts.slice(0, 10).map((a) => <AlertBadge key={a.id} alert={a} />)
          : (
            <div className="rounded-xl border border-surface-border bg-surface-card px-5 py-8 text-center">
              <p className="text-sm text-surface-muted">No alerts for this host</p>
            </div>
          )}
      </div>

      {/* ── Threshold settings modal ──────────────────────────────── */}
      {isSettingsOpen && (
        <ConfigureThresholdsModal
          host={host}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onUpdate={(updatedHost) => setHost(updatedHost)}
        />
      )}

      <DeleteHostModal
        hostName={host.name}
        isOpen={isDeleteOpen}
        isDeleting={isDeleting}
        onConfirm={async () => {
          setIsDeleting(true);
          try {
            await hostsApi.delete(host.id);
            router.replace("/hosts");
          } finally {
            setIsDeleting(false);
          }
        }}
        onClose={() => setIsDeleteOpen(false)}
      />
    </div>
  );
}
