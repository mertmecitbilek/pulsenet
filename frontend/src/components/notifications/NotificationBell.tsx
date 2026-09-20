"use client";

/**
 * NotificationBell — unread badge + dropdown feed of recent alert events.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon, AlertTriangle, Bell, BellOff, BellRing, CheckCircle2, Monitor,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNotifications, type AppNotification } from "@/context/NotificationContext";
import { cn } from "@/lib/utils";

function itemIcon(n: AppNotification) {
  if (n.kind === "recovered") return { Icon: CheckCircle2, cls: "text-green-400" };
  return n.severity === "critical"
    ? { Icon: AlertOctagon, cls: "text-red-400" }
    : { Icon: AlertTriangle, cls: "text-yellow-400" };
}

export function NotificationBell() {
  const router = useRouter();
  const {
    notifications, unreadCount, markAllRead, clearAll,
    desktopEnabled, desktopPermission, enableDesktop, disableDesktop,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const toggle = () => {
    setIsOpen((open) => {
      if (!open && unreadCount > 0) markAllRead();
      return !open;
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={toggle}
        title="Notifications"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all",
          unreadCount > 0
            ? "border-red-500/30 bg-red-500/10 text-red-400"
            : "border-surface-border text-surface-muted hover:bg-surface-hover hover:text-white"
        )}
      >
        {unreadCount > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-11 z-50 w-96 overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-surface-muted transition-colors hover:text-white"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Desktop notification toggle */}
          <div className="flex items-center gap-3 border-b border-surface-border bg-surface-hover/30 px-4 py-3">
            <Monitor className="h-4 w-4 flex-shrink-0 text-surface-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white">Desktop notifications</p>
              <p className="text-[11px] text-surface-muted">
                {desktopPermission === "unsupported"
                  ? "Not supported by this browser"
                  : desktopPermission === "denied"
                  ? "Blocked — allow notifications in your browser settings"
                  : desktopEnabled
                  ? "On — shown while this tab is in the background"
                  : "Off — get alerted while using another tab"}
              </p>
            </div>
            {desktopPermission !== "unsupported" && desktopPermission !== "denied" && (
              <button
                onClick={() => (desktopEnabled ? disableDesktop() : enableDesktop())}
                className={cn(
                  "flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  desktopEnabled
                    ? "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                    : "border-surface-border text-surface-muted hover:bg-surface-hover hover:text-white"
                )}
              >
                {desktopEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                {desktopEnabled ? "On" : "Off"}
              </button>
            )}
          </div>

          {/* Feed */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto mb-2 h-8 w-8 text-surface-muted" />
                <p className="text-sm text-surface-muted">No notifications yet</p>
                <p className="mt-1 text-xs text-surface-muted">
                  You will be notified when a host or service check fails.
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const { Icon, cls } = itemIcon(n);
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      router.push(`/hosts/${n.hostId}`);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-surface-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-hover",
                      !n.read && "bg-brand-500/5"
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", cls)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-surface-muted">{n.body}</p>
                      <p className="mt-1 text-[11px] text-surface-muted">
                        {formatDistanceToNow(new Date(n.at), { addSuffix: true })}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
