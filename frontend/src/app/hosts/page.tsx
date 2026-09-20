"use client";

/**
 * Hosts Page — /hosts
 *
 * Lists all registered hosts and provides Add / Delete actions.
 */

import { useEffect, useState, useCallback } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { hostsApi, checksApi, type Host } from "@/lib/api";
import { HostList, type CheckSummary } from "@/components/hosts/HostList";
import { AddHostModal } from "@/components/hosts/AddHostModal";
import { DeleteHostModal } from "@/components/hosts/DeleteHostModal";
import { useAuth } from "@/context/AuthContext";

export default function HostsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [hosts, setHosts]           = useState<Host[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [checkSummary, setCheckSummary] = useState<CheckSummary>({});

  // Delete state
  const [hostToDelete, setHostToDelete] = useState<Host | null>(null);
  const [isDeleting, setIsDeleting]     = useState(false);

  const fetchHosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const [data, checks] = await Promise.all([
        hostsApi.list(),
        checksApi.list().catch(() => []),
      ]);
      setHosts(data);
      const summary: CheckSummary = {};
      for (const c of checks) {
        const entry = (summary[c.host_id] ??= { total: 0, down: 0 });
        entry.total += 1;
        if (c.state === "down") entry.down += 1;
      }
      setCheckSummary(summary);
    } catch {
      setError("Failed to load hosts.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHosts();
  }, [fetchHosts]);

  // Opens the confirmation modal
  const handleDeleteRequest = (id: string) => {
    const host = hosts.find((h) => h.id === id) ?? null;
    setHostToDelete(host);
  };

  // Called when user confirms deletion
  const handleDeleteConfirm = async () => {
    if (!hostToDelete) return;
    setIsDeleting(true);
    try {
      await hostsApi.delete(hostToDelete.id);
      setHosts((prev) => prev.filter((h) => h.id !== hostToDelete.id));
      setHostToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="px-8 py-8 space-y-6 animate-fade-in">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Devices</h1>
          <p className="text-sm text-surface-muted mt-1">
            {hosts.length} device{hosts.length !== 1 ? "s" : ""} monitored
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchHosts}
            className="btn-secondary"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {isAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" />
              Add Device
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <HostList hosts={hosts} checkSummary={checkSummary} onDelete={isAdmin ? handleDeleteRequest : undefined} isLoading={isLoading} />

      <AddHostModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={fetchHosts}
      />

      <DeleteHostModal
        hostName={hostToDelete?.name ?? ""}
        isOpen={!!hostToDelete}
        isDeleting={isDeleting}
        onConfirm={handleDeleteConfirm}
        onClose={() => setHostToDelete(null)}
      />
    </div>
  );
}

