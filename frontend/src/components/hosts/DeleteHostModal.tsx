"use client";

/**
 * DeleteHostModal — Confirmation dialog before removing a host.
 *
 * Shows host name + a warning that all metrics and alerts will be deleted.
 * Calls onConfirm() which should handle the API call.
 */

import { useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";

interface DeleteHostModalProps {
  hostName: string;
  isOpen: boolean;
  isDeleting?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function DeleteHostModal({
  hostName,
  isOpen,
  isDeleting = false,
  onConfirm,
  onClose,
}: DeleteHostModalProps) {
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setError(null);
    try {
      await onConfirm();
    } catch {
      setError("Failed to delete host. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-surface-card shadow-2xl animate-fade-in">
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute right-4 top-4 p-1.5 text-surface-muted hover:text-white rounded-lg hover:bg-surface-hover transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6">
          {/* Icon + title */}
          <div className="flex items-start gap-4 mb-5">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Remove Host</h2>
              <p className="text-sm text-surface-muted mt-0.5">
                This action cannot be undone.
              </p>
            </div>
          </div>

          {/* Warning body */}
          <div className="rounded-xl bg-red-500/5 border border-red-500/15 px-4 py-3 mb-5">
            <p className="text-sm text-surface-muted leading-relaxed">
              You are about to permanently remove{" "}
              <span className="font-semibold text-white">{hostName}</span>{" "}
              from PulseNet. All associated{" "}
              <span className="text-red-400 font-medium">metrics</span> and{" "}
              <span className="text-red-400 font-medium">alerts</span> will
              also be deleted.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-400 mb-4">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 rounded-xl border border-surface-border bg-surface-DEFAULT px-4 py-2.5 text-sm font-medium text-surface-muted hover:text-white hover:bg-surface-hover transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isDeleting}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-lg shadow-red-500/20"
            >
              <Trash2 className="h-4 w-4" />
              {isDeleting ? "Removing…" : "Remove Host"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
