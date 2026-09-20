"use client";

/**
 * ClientLayout — wraps the app shell (Sidebar + main).
 * Rendered as a client component so it can consume AuthContext.
 * On /login and /register the sidebar is hidden and children take full width.
 */

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";

const AUTH_PATHS = ["/login", "/register"];

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname);

  if (isAuthPage) {
    // Full-screen layout for login / register
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full bg-hero-glow">{children}</div>
      </main>
    </div>
  );
}
