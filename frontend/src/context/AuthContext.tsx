/**
 * PulseNet — Auth Context
 *
 * Provides:
 *  - Current user state (null = not logged in)
 *  - login() / logout() helpers
 *  - Axios interceptor that injects Bearer token on every request
 */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { setLogoutHandler, TOKEN_STORAGE_KEY } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

// ── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = TOKEN_STORAGE_KEY;
const USER_KEY  = "pulsenet_user";

// Pages that don't require authentication
const PUBLIC_PATHS = ["/login", "/register"];

// ── Provider ───────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [token,     setToken]     = useState<string | null>(null);
  const [user,      setUser]      = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser  = localStorage.getItem(USER_KEY);
    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  // Register logout as the global 401 handler so expired tokens auto-logout
  useEffect(() => {
    setLogoutHandler(() => {
      // Only trigger if not already on an auth page (avoid redirect loops)
      if (!PUBLIC_PATHS.includes(window.location.pathname)) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      }
    });
  }, []);

  // Redirect unauthenticated users away from protected pages
  useEffect(() => {
    if (isLoading) return;
    const isPublic = PUBLIC_PATHS.includes(pathname);
    if (!token && !isPublic) {
      router.replace("/login");
    }
    if (token && isPublic) {
      router.replace("/");
    }
  }, [token, isLoading, pathname, router]);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    router.replace("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {isLoading ? (
        <div className="flex h-screen items-center justify-center bg-surface-DEFAULT">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-surface-border border-t-brand-500" />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
