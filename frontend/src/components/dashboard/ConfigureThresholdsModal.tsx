"use client";

import { useState } from "react";
import { X, Save, AlertTriangle } from "lucide-react";
import { hostsApi, type Host } from "@/lib/api";

interface ConfigureThresholdsModalProps {
  host: Host;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedHost: Host) => void;
}

export function ConfigureThresholdsModal({
  host,
  isOpen,
  onClose,
  onUpdate,
}: ConfigureThresholdsModalProps) {
  const [cpu, setCpu] = useState(host.alert_cpu_threshold || 90);
  const [memory, setMemory] = useState(host.alert_memory_threshold || 90);
  const [disk, setDisk] = useState(host.alert_disk_threshold || 90);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const updated = await hostsApi.update(host.id, {
        alert_cpu_threshold: cpu,
        alert_memory_threshold: memory,
        alert_disk_threshold: disk,
      });
      onUpdate(updated);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update thresholds.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface-hover/30">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold text-white">Alert Thresholds</h2>
          </div>
          <button
            onClick={onClose}
            className="text-surface-muted hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium text-surface-muted">CPU Threshold</label>
                <span className="text-sm font-mono text-white">{cpu}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={cpu}
                onChange={(e) => setCpu(Number(e.target.value))}
                className="w-full h-2 bg-surface-border rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium text-surface-muted">Memory Threshold</label>
                <span className="text-sm font-mono text-white">{memory}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={memory}
                onChange={(e) => setMemory(Number(e.target.value))}
                className="w-full h-2 bg-surface-border rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <label className="text-sm font-medium text-surface-muted">Disk Threshold</label>
                <span className="text-sm font-mono text-white">{disk}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={disk}
                onChange={(e) => setDisk(Number(e.target.value))}
                className="w-full h-2 bg-surface-border rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
            </div>
            
            <p className="text-xs text-surface-muted leading-relaxed mt-4">
              If metric usage exceeds these thresholds, a new alert will be generated automatically and marked as Open.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-surface-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-muted hover:text-white transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSubmitting ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
