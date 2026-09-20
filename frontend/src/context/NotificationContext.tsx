"use client";

/**
 * PulseNet — Notification Context
 *
 * Polls the alert feed and turns changes into notifications:
 *   - an alert that appears as "open"      → "triggered"
 *   - an alert that goes open → "resolved" → "recovered"
 *
 * The previous alert state is persisted, so a failure that happened while
 * the tab was closed is still reported on the next visit. The very first
 * run only records a baseline (no notification spam on first login).
 *
 * Delivery: in-app toast + bell dropdown always; a desktop notification
 * when the user enabled it and the tab is in the background.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatDistanceStrict } from "date-fns";
import { alertsApi, type Alert } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { metricTypeLabel } from "@/lib/utils";
import { ToastStack } from "@/components/notifications/ToastStack";

const POLL_MS = 15_000;
const ALERT_WINDOW = 100;
const MAX_STORED = 50;
const MAX_TOASTS = 3;

const NOTIFICATIONS_KEY = "pulsenet_notifications";
const ALERT_STATE_KEY   = "pulsenet_alert_state";
const DESKTOP_KEY       = "pulsenet_desktop_notifications";

export type NotificationKind = "triggered" | "recovered";

export interface AppNotification {
  id: string;
  alertId: string;
  hostId: string;
  hostName: string;
  kind: NotificationKind;
  severity: Alert["severity"];
  metricType: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
}

export type DesktopPermission = "unsupported" | "default" | "granted" | "denied";

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  toasts: AppNotification[];
  dismissToast: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  desktopEnabled: boolean;
  desktopPermission: DesktopPermission;
  enableDesktop: () => Promise<void>;
  disableDesktop: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function notificationTitle(alert: Alert, kind: NotificationKind, hostName: string): string {
  const failed = kind === "triggered";
  switch (alert.metric_type) {
    case "host_down":
      return failed ? `${hostName} is offline` : `${hostName} is back online`;
    case "check_down":
      return failed ? `${hostName} — service check failed` : `${hostName} — service check recovered`;
    default: {
      const label = metricTypeLabel(alert.metric_type);
      return failed ? `${hostName} — high ${label} usage` : `${hostName} — ${label} back to normal`;
    }
  }
}

function recoveryBody(alert: Alert): string {
  if (!alert.resolved_at) return "Back to normal.";
  const downtime = formatDistanceStrict(new Date(alert.resolved_at), new Date(alert.triggered_at));
  return `Back to normal after ${downtime}.`;
}

function buildNotification(alert: Alert, kind: NotificationKind): AppNotification {
  const hostName = alert.host_name ?? "Unknown host";
  return {
    id: `${alert.id}:${kind}`,
    alertId: alert.id,
    hostId: alert.host_id,
    hostName,
    kind,
    severity: alert.severity,
    metricType: alert.metric_type,
    title: notificationTitle(alert, kind, hostName),
    body: kind === "triggered" ? alert.message : recoveryBody(alert),
    at:
      (kind === "recovered" ? alert.resolved_at : alert.triggered_at) ??
      new Date().toISOString(),
    read: false,
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [desktopEnabled, setDesktopEnabled] = useState(false);
  const [desktopPermission, setDesktopPermission] =
    useState<DesktopPermission>("unsupported");

  // id → status of the previous poll; null until the baseline is known
  const prevStatuses = useRef<Record<string, string> | null>(null);
  const hydrated = useRef(false);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    setNotifications(readJson<AppNotification[]>(NOTIFICATIONS_KEY, []));
    prevStatuses.current = readJson<Record<string, string> | null>(ALERT_STATE_KEY, null);
    setDesktopEnabled(readJson<boolean>(DESKTOP_KEY, false));
    if (typeof window !== "undefined" && "Notification" in window) {
      setDesktopPermission(Notification.permission as DesktopPermission);
    }
    hydrated.current = true;
  }, []);

  // Persist the notification list
  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  }, [notifications]);

  const showDesktop = useCallback(
    (items: AppNotification[]) => {
      if (!desktopEnabled || typeof window === "undefined") return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      // Only when the tab is in the background — the toast covers the foreground
      if (!document.hidden) return;

      for (const item of items.slice(0, MAX_TOASTS)) {
        try {
          new Notification(item.title, { body: item.body, tag: item.id });
        } catch {
          // Some browsers require a service worker; ignore silently
        }
      }
    },
    [desktopEnabled]
  );

  const poll = useCallback(async () => {
    const alerts = await alertsApi.list(ALERT_WINDOW);

    const current: Record<string, string> = {};
    for (const alert of alerts) current[alert.id] = alert.status;

    const previous = prevStatuses.current;
    prevStatuses.current = current;
    localStorage.setItem(ALERT_STATE_KEY, JSON.stringify(current));

    // First run ever — remember what already exists, announce nothing
    if (previous === null) return;

    const fresh: AppNotification[] = [];
    for (const alert of alerts) {
      const before = previous[alert.id];
      if (before === undefined) {
        // Unseen alert; if it is already resolved it came and went unnoticed
        if (alert.status === "open") fresh.push(buildNotification(alert, "triggered"));
      } else if (before === "open" && alert.status === "resolved") {
        fresh.push(buildNotification(alert, "recovered"));
      }
    }
    if (!fresh.length) return;

    setNotifications((prev) => [...fresh, ...prev].slice(0, MAX_STORED));
    setToasts((prev) => [...fresh, ...prev].slice(0, MAX_TOASTS));
    showDesktop(fresh);
  }, [showDesktop]);

  // Poll while logged in; reset everything on logout
  useEffect(() => {
    if (!token) {
      prevStatuses.current = null;
      setNotifications([]);
      setToasts([]);
      if (hydrated.current) {
        localStorage.removeItem(ALERT_STATE_KEY);
        localStorage.removeItem(NOTIFICATIONS_KEY);
      }
      return;
    }

    let active = true;
    const run = () => {
      if (active) poll().catch(() => {});
    };
    run();
    const timer = setInterval(run, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, poll]);

  const enableDesktop = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setDesktopPermission(permission as DesktopPermission);
    const granted = permission === "granted";
    setDesktopEnabled(granted);
    localStorage.setItem(DESKTOP_KEY, JSON.stringify(granted));
  }, []);

  const disableDesktop = useCallback(() => {
    setDesktopEnabled(false);
    localStorage.setItem(DESKTOP_KEY, "false");
  }, []);

  const value: NotificationContextValue = {
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    toasts,
    dismissToast: (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    markAllRead: () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))),
    clearAll: () => setNotifications([]),
    desktopEnabled,
    desktopPermission,
    enableDesktop,
    disableDesktop,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastStack />
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationProvider>");
  return ctx;
}
