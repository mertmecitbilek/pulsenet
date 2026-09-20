"use client";

/**
 * AddCheckModal — Dialog for adding a ping / HTTP / TCP service check to a host.
 */

import { useState } from "react";
import { X, Plus, Activity, Globe, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { checksApi, type CheckType, type ServiceCheck } from "@/lib/api";

interface AddCheckModalProps {
  hostId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (check: ServiceCheck) => void;
}

const TYPES: { value: CheckType; label: string; Icon: React.ElementType; hint: string }[] = [
  { value: "ping", label: "Ping",      Icon: Activity, hint: "ICMP echo — is the host reachable?" },
  { value: "http", label: "HTTP",      Icon: Globe,    hint: "GET a URL and check the status code" },
  { value: "tcp",  label: "TCP port",  Icon: Plug,     hint: "Open a connection to a port (SSH, DB, ...)" },
];

const inputCls = cn(
  "w-full rounded-xl border border-surface-border bg-surface-DEFAULT px-4 py-2.5 text-sm text-white",
  "placeholder:text-surface-muted outline-none",
  "focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
);
const labelCls = "block text-xs font-medium text-surface-muted mb-1.5";

export function AddCheckModal({ hostId, isOpen, onClose, onCreated }: AddCheckModalProps) {
  const [type, setType]           = useState<CheckType>("ping");
  const [name, setName]           = useState("");
  const [target, setTarget]       = useState("");
  const [port, setPort]           = useState("");
  const [expected, setExpected]   = useState("");
  const [interval, setInterval_]  = useState("30");
  const [timeout, setTimeout_]    = useState("5");
  const [threshold, setThreshold] = useState("3");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setType("ping"); setName(""); setTarget(""); setPort(""); setExpected("");
    setInterval_("30"); setTimeout_("5"); setThreshold("3"); setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await checksApi.create({
        host_id: hostId,
        name: name.trim(),
        type,
        target: target.trim() || undefined,
        port: type === "tcp" ? Number(port) : undefined,
        expected_status: type === "http" && expected ? Number(expected) : undefined,
        interval_seconds: Number(interval),
        timeout_seconds: Number(timeout),
        fail_threshold: Number(threshold),
      });
      onCreated(created);
      reset();
      onClose();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: any) => d.msg?.replace(/^Value error, /, "")).join(", ")
          : "Failed to create check."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeHint = TYPES.find((t) => t.value === type)!.hint;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-border bg-surface-card shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <h2 className="text-base font-semibold text-white">Add Service Check</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-surface-muted hover:text-white hover:bg-surface-border transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Type selector */}
          <div>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition-all",
                    type === value
                      ? "border-brand-500/50 bg-brand-500/15 text-brand-400"
                      : "border-surface-border text-surface-muted hover:text-white hover:bg-surface-hover"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-surface-muted">{activeHint}</p>
          </div>

          <div>
            <label className={labelCls} htmlFor="chk-name">Name *</label>
            <input
              id="chk-name" required className={inputCls} value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "http" ? "Website" : type === "tcp" ? "SSH" : "Reachability"}
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="chk-target">
              {type === "http" ? "URL *" : "Target (leave empty to use the device address)"}
            </label>
            <input
              id="chk-target" className={inputCls} value={target}
              required={type === "http"}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={type === "http" ? "https://example.com/health" : "Device address"}
            />
          </div>

          {type === "tcp" && (
            <div>
              <label className={labelCls} htmlFor="chk-port">Port *</label>
              <input
                id="chk-port" required type="number" min={1} max={65535} className={inputCls}
                value={port} onChange={(e) => setPort(e.target.value)} placeholder="Port number"
              />
            </div>
          )}

          {type === "http" && (
            <div>
              <label className={labelCls} htmlFor="chk-expected">
                Expected status code (empty = any 2xx / 3xx)
              </label>
              <input
                id="chk-expected" type="number" min={100} max={599} className={inputCls}
                value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="200"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} htmlFor="chk-interval">Every (s)</label>
              <input
                id="chk-interval" type="number" min={10} max={3600} className={inputCls}
                value={interval} onChange={(e) => setInterval_(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="chk-timeout">Timeout (s)</label>
              <input
                id="chk-timeout" type="number" min={1} max={30} className={inputCls}
                value={timeout} onChange={(e) => setTimeout_(e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="chk-threshold">Fails to alert</label>
              <input
                id="chk-threshold" type="number" min={1} max={10} className={inputCls}
                value={threshold} onChange={(e) => setThreshold(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-surface-muted -mt-1">
            An alert opens after {threshold || "N"} failed runs in a row and closes on the first success.
          </p>

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-surface-border bg-transparent py-2.5 text-sm font-medium text-surface-muted hover:text-white hover:bg-surface-hover transition-all"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" />
              {isSubmitting ? "Adding…" : "Add Check"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
