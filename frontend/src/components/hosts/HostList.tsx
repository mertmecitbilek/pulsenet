"use client";

/**
 * HostList — Renders a table of all monitored hosts.
 */

import Link from "next/link";
import { Server, Wifi, WifiOff, HelpCircle, Trash2, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { Host } from "@/lib/api";

export type CheckSummary = Record<string, { total: number; down: number }>;

interface HostListProps {
  hosts: Host[];
  checkSummary?: CheckSummary;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
}

const STATUS_CONFIG = {
  online:  { label: "Online",  Icon: Wifi,      cls: "text-green-400 bg-green-500/10 border-green-500/20" },
  offline: { label: "Offline", Icon: WifiOff,   cls: "text-red-400 bg-red-500/10 border-red-500/20" },
  unknown: { label: "Unknown", Icon: HelpCircle, cls: "text-surface-muted bg-surface-border/40 border-surface-border" },
} as const;

function StatusBadge({ status }: { status: Host["status"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const { Icon } = cfg;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", cfg.cls)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

export function HostList({ hosts, onDelete, isLoading, checkSummary }: HostListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-surface-card border border-surface-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (!hosts.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Server className="h-12 w-12 text-surface-muted mb-4" />
        <h3 className="text-white font-semibold mb-1">No devices yet</h3>
        <p className="text-sm text-surface-muted">Add your first device to start monitoring.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-surface-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border bg-surface-card/50">
            {["Host", "IP Address", "OS", "Status", "Checks", "Last Seen", ""].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-surface-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border bg-surface-card">
          {hosts.map((host) => (
            <tr
              key={host.id}
              className="group transition-colors hover:bg-surface-hover"
            >
              <td className="px-4 py-4">
                <Link href={`/hosts/${host.id}`} className="flex items-center gap-3 group/name">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10">
                    <Server className="h-4 w-4 text-brand-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white group-hover/name:text-brand-400 transition-colors">
                      {host.name}
                    </p>
                    {host.description && (
                      <p className="text-xs text-surface-muted truncate max-w-[180px]">{host.description}</p>
                    )}
                  </div>
                </Link>
              </td>
              <td className="px-4 py-4 font-mono text-surface-muted">{host.ip_address}</td>
              <td className="px-4 py-4 text-surface-muted">{host.os ?? "—"}</td>
              <td className="px-4 py-4">
                <StatusBadge status={host.status} />
              </td>
              <td className="px-4 py-4 text-xs">
                {checkSummary?.[host.id] ? (
                  <span className={checkSummary[host.id].down > 0 ? "text-red-400 font-medium" : "text-green-400"}>
                    {checkSummary[host.id].total - checkSummary[host.id].down}/{checkSummary[host.id].total} up
                  </span>
                ) : (
                  <span className="text-surface-muted">—</span>
                )}
              </td>
              <td className="px-4 py-4 text-surface-muted text-xs">
                {host.last_seen_at
                  ? formatDistanceToNow(new Date(host.last_seen_at), { addSuffix: true })
                  : "Never"}
              </td>
              <td className="px-4 py-4">
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link
                    href={`/hosts/${host.id}`}
                    className="rounded-lg p-1.5 text-surface-muted hover:text-white hover:bg-surface-border transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(host.id)}
                      className="rounded-lg p-1.5 text-surface-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
