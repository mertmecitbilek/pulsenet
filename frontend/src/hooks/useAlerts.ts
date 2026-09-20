"use client";

/**
 * useAlerts — Polls for recent alerts every 30 seconds.
 */

import { useCallback, useEffect, useState } from "react";
import { alertsApi, type Alert } from "@/lib/api";

interface UseAlertsResult {
  alerts: Alert[];
  openCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const POLL_INTERVAL_MS = 30_000;

export function useAlerts(limit = 50): UseAlertsResult {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const [data, count] = await Promise.all([
        alertsApi.list(limit),
        alertsApi.openCount(),
      ]);
      setAlerts(data);
      setOpenCount(count);
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch alerts");
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  // Initial fetch + polling
  useEffect(() => {
    fetchAlerts();
    const intervalId = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchAlerts]);

  return { alerts, openCount, isLoading, error, refetch: fetchAlerts };
}
