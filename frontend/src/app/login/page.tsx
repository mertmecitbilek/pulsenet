"use client";

/**
 * Login Page — /login
 */

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Zap, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { apiClient, authApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [showPass,   setShowPass]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [isLoading,  setIsLoading]  = useState(false);
  const [canRegister, setCanRegister] = useState(false);

  useEffect(() => {
    authApi.registrationOpen().then(setCanRegister).catch(() => setCanRegister(false));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const { data } = await apiClient.post("/api/auth/login", { email, password });
      login(data.access_token, data.user);
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-DEFAULT bg-hero-glow px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/30 mb-4">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-surface-muted text-sm mt-1">Sign in to PulseNet</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-surface-border bg-surface-card p-8 shadow-2xl">

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 mb-6 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-surface-muted">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-muted" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-surface-border bg-surface-DEFAULT pl-10 pr-4 py-2.5 text-sm text-white placeholder-surface-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-surface-muted">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-muted" />
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-surface-border bg-surface-DEFAULT pl-10 pr-10 py-2.5 text-sm text-white placeholder-surface-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-muted hover:text-white transition-colors"
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30"
            >
              {isLoading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {canRegister && (
            <p className="mt-6 text-center text-sm text-surface-muted">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
                Create one
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
