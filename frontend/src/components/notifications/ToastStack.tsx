"use client";

/**
 * ToastStack — transient alert popups in the bottom-right corner.
 *
 * Auto-dismisses; clicking a toast opens the host it belongs to.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useNotifications, type AppNotification } from "@/context/NotificationContext";
import { cn } from "@/lib/utils";

const AUTO_DISMISS_MS = 9_000;

function toastStyle(n: AppNotification) {
  if (n.kind === "recovered") {
    return { cls: "border-green-500/40 bg-green-500/10", Icon: CheckCircle2, icon: "text-green-400" };
  }
  return n.severity === "critical"
    ? { cls: "border-red-500/40 bg-red-500/10", Icon: AlertOctagon, icon: "text-red-400" }
    : { cls: "border-yellow-500/40 bg-yellow-500/10", Icon: AlertTriangle, icon: "text-yellow-400" };
}

function Toast({ notification }: { notification: AppNotification }) {
  const { dismissToast } = useNotifications();
  const router = useRouter();
  const { cls, Icon, icon } = toastStyle(notification);

  useEffect(() => {
    const timer = setTimeout(() => dismissToast(notification.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notification.id, dismissToast]);

  return (
    <div
      role="status"
      onClick={() => {
        router.push(`/hosts/${notification.hostId}`);
        dismissToast(notification.id);
      }}
      className={cn(
        "pointer-events-auto flex w-80 cursor-pointer items-start gap-3 rounded-xl border p-4",
        "bg-surface-card shadow-2xl backdrop-blur animate-slide-up transition-all hover:bg-surface-hover",
        cls
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", icon)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{notification.title}</p>
        <p className="mt-0.5 text-xs text-surface-muted line-clamp-2">{notification.body}</p>
      </div>
      <button
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          dismissToast(notification.id);
        }}
        className="rounded-lg p-1 text-surface-muted transition-colors hover:bg-surface-border hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastStack() {
  const { toasts } = useNotifications();
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col gap-3">
      {toasts.map((n) => (
        <Toast key={n.id} notification={n} />
      ))}
    </div>
  );
}
