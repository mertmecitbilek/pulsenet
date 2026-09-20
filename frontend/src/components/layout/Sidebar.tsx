"use client";

/**
 * Sidebar — Main navigation for PulseNet dashboard.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Server, Bell, BarChart2, Radar, Zap, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";

const NAV_ITEMS = [
  { href: "/",       label: "Dashboard", Icon: BarChart2 },
  { href: "/hosts",  label: "Devices",   Icon: Server },
  { href: "/checks", label: "Checks",    Icon: Radar },
  { href: "/alerts", label: "Alerts",    Icon: Bell },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Do not render the sidebar on authentication pages
  if (pathname === "/login" || pathname === "/register") {
    return null;
  }

  return (
    <aside className="relative z-50 flex h-screen w-64 flex-col border-r border-surface-border bg-surface-card">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-surface-border">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-lg font-bold text-white">PulseNet</span>
          <p className="text-xs text-surface-muted truncate">Monitoring Platform</p>
        </div>
        <NotificationBell />
      </div>

      {/* Live indicator */}
      <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-xs font-medium text-green-400">Live Monitoring</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/30"
                  : "text-surface-muted hover:bg-surface-hover hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer / User Profile */}
      <div className="px-4 py-4 border-t border-surface-border">
        {user ? (
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-surface-muted truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="p-2 text-surface-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex-shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <p className="text-xs text-surface-muted text-center">
          PulseNet v1.0.0 · Open Source
        </p>
      </div>
    </aside>
  );
}
