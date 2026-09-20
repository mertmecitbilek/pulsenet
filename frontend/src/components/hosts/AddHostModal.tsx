"use client";

/**
 * AddHostModal — Dialog for registering a new monitored host.
 *
 * Templates create the host together with the service checks that make
 * sense for it, so a printer or a website is monitored right away instead
 * of needing a second trip through the "add check" dialog.
 */

import { useState } from "react";
import { Plus, Router, Globe, Server, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { checksApi, hostsApi, type Host, type ServiceCheckCreate } from "@/lib/api";

interface AddHostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type TemplateId = "home" | "website" | "server" | "custom";

interface Template {
  id: TemplateId;
  label: string;
  Icon: React.ElementType;
  hint: string;
  addressLabel: string;
  addressPlaceholder: string;
}

const TEMPLATES: Template[] = [
  {
    id: "home",
    label: "Home device",
    Icon: Router,
    hint: "Router, printer, phone, NAS — pings the device to see if it is on.",
    addressLabel: "IP address *",
    addressPlaceholder: "Device IP on your network",
  },
  {
    id: "website",
    label: "Website",
    Icon: Globe,
    hint: "Checks the page over HTTP and pings the domain.",
    addressLabel: "URL *",
    addressPlaceholder: "https://example.com",
  },
  {
    id: "server",
    label: "Server",
    Icon: Server,
    hint: "Pings the server and checks an SSH/app port. Install the agent for CPU, RAM and disk.",
    addressLabel: "IP address or hostname *",
    addressPlaceholder: "Server IP or hostname",
  },
  {
    id: "custom",
    label: "Custom",
    Icon: Settings2,
    hint: "Just the host record — add checks yourself, or let an agent report to it.",
    addressLabel: "IP address or hostname *",
    addressPlaceholder: "IP address or hostname",
  },
];

// Home devices sleep (phones, printers in standby), so they get a slower
// interval and more tolerance before an alert is raised.
const HOME_CHECK = { interval_seconds: 60, timeout_seconds: 5, fail_threshold: 5 };
const NET_CHECK  = { interval_seconds: 60, timeout_seconds: 8, fail_threshold: 3 };

const inputCls = cn(
  "w-full rounded-xl border border-surface-border bg-surface-DEFAULT px-4 py-2.5 text-sm text-white",
  "placeholder:text-surface-muted outline-none",
  "focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
);
const labelCls = "block text-xs font-medium text-surface-muted mb-1.5";

/** Accepts "example.com" as well as a full URL. */
function parseWebsite(input: string): { url: string; hostname: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!url.hostname) return null;
    return { url: url.toString(), hostname: url.hostname };
  } catch {
    return null;
  }
}

function readError(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d.msg?.replace(/^Value error, /, "")).join(", ");
  }
  return fallback;
}

export function AddHostModal({ isOpen, onClose, onCreated }: AddHostModalProps) {
  const [template, setTemplate] = useState<TemplateId>("home");
  const [name, setName]         = useState("");
  const [address, setAddress]   = useState("");
  const [port, setPort]         = useState("22");
  const [os, setOs]             = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  if (!isOpen) return null;

  const active = TEMPLATES.find((t) => t.id === template)!;

  const reset = () => {
    setTemplate("home"); setName(""); setAddress(""); setPort("22");
    setOs(""); setDescription(""); setError(null);
  };

  /** Checks to create for the new host, per template. */
  const plannedChecks = (host: Host, website: { url: string } | null): ServiceCheckCreate[] => {
    switch (template) {
      case "home":
        return [{ host_id: host.id, name: "Reachable (ping)", type: "ping", ...HOME_CHECK }];
      case "website":
        return [
          { host_id: host.id, name: "Website (HTTP)", type: "http", target: website!.url, ...NET_CHECK },
          { host_id: host.id, name: "Reachable (ping)", type: "ping", ...NET_CHECK },
        ];
      case "server":
        return [
          { host_id: host.id, name: "Reachable (ping)", type: "ping", ...NET_CHECK },
          ...(port ? [{ host_id: host.id, name: `Port ${port}`, type: "tcp" as const, port: Number(port), ...NET_CHECK }] : []),
        ];
      default:
        return [];
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const website = template === "website" ? parseWebsite(address) : null;
    if (template === "website" && !website) {
      setError("Enter a valid address, for example https://example.com");
      return;
    }

    setIsSubmitting(true);
    let host: Host;
    try {
      host = await hostsApi.create({
        name: name.trim(),
        ip_address: website ? website.hostname : address.trim(),
        os: os.trim() || undefined,
        description: description.trim() || undefined,
      });
    } catch (err: any) {
      setError(readError(err, "Failed to add host."));
      setIsSubmitting(false);
      return;
    }

    // The host exists from here on — a failing check must not lose it.
    try {
      for (const check of plannedChecks(host, website)) {
        await checksApi.create(check);
      }
    } catch (err: any) {
      onCreated();
      setError(`Host added, but its checks could not be created: ${readError(err, "unknown error")}`);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onCreated();
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-border bg-surface-card shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10">
              <Server className="h-4 w-4 text-brand-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Add Device</h2>
          </div>
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

          {/* Template picker */}
          <div>
            <div className="grid grid-cols-4 gap-2">
              {TEMPLATES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTemplate(id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-[11px] font-semibold transition-all",
                    template === id
                      ? "border-brand-500/50 bg-brand-500/15 text-brand-400"
                      : "border-surface-border text-surface-muted hover:text-white hover:bg-surface-hover"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-surface-muted">{active.hint}</p>
          </div>

          <div>
            <label className={labelCls} htmlFor="host-name">Name *</label>
            <input
              id="host-name" required className={inputCls} value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                template === "home" ? "Living room printer"
                : template === "website" ? "My website"
                : "web-server-01"
              }
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="host-address">{active.addressLabel}</label>
            <input
              id="host-address" required className={inputCls} value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={active.addressPlaceholder}
            />
          </div>

          {template === "server" && (
            <div>
              <label className={labelCls} htmlFor="host-port">Port to check (empty to skip)</label>
              <input
                id="host-port" type="number" min={1} max={65535} className={inputCls}
                value={port} onChange={(e) => setPort(e.target.value)} placeholder="22"
              />
            </div>
          )}

          {template === "custom" && (
            <>
              <div>
                <label className={labelCls} htmlFor="host-os">OS</label>
                <input
                  id="host-os" className={inputCls} value={os}
                  onChange={(e) => setOs(e.target.value)} placeholder="Ubuntu 22.04"
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="host-desc">Description</label>
                <input
                  id="host-desc" className={inputCls} value={description}
                  onChange={(e) => setDescription(e.target.value)} placeholder="Production web server"
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-surface-border bg-transparent py-2.5 text-sm font-medium text-surface-muted hover:text-white hover:bg-surface-hover transition-all"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={isSubmitting}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white",
                "hover:bg-brand-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Plus className="h-4 w-4" />
              {isSubmitting ? "Adding…" : "Add Device"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
