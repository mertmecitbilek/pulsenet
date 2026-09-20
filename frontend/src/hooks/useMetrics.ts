"use client";

/**
 * useMetrics — Custom hook for metric data
 *
 * Provides:
 *  - `history`: Historical metric array (REST)
 *  - `live`: The most recent metric pushed via WebSocket
 *  - `isLoading`, `error`, `refetch`
 *
 * History behaviour by range:
 *  - no range / <= 1h : raw rows; new WebSocket points are appended live.
 *  - > 1h             : server-side averaged buckets; re-fetched every minute
 *                       (appending raw points to averaged buckets would mix
 *                       resolutions).
 *
 * @param hostId       Target host UUID
 * @param historyLimit Max rows when sinceHours is undefined
 * @param sinceHours   If set, fetch the last N hours (overrides limit)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { metricsApi, type Metric } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/^http/, "ws") ||
  "ws://localhost:8000";

const WS_CLOSE_UNAUTHORIZED = 4401;
const MAX_RAW_POINTS = 2000;
const BUCKETED_REFRESH_MS = 60_000;

interface UseMetricsResult {
  history: Metric[];
  live: Metric | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMetrics(
  hostId: string,
  historyLimit = 60,
  sinceHours?: number
): UseMetricsResult {
  const { token } = useAuth();
  const [history, setHistory] = useState<Metric[]>([]);
  const [live, setLive] = useState<Metric | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Latest range settings for the long-lived WebSocket handler (avoids
  // reconnecting the socket every time the user switches the time range).
  const rangeRef = useRef({ historyLimit, sinceHours });
  rangeRef.current = { historyLimit, sinceHours };

  // Guards against out-of-order responses when the range is switched quickly.
  const requestSeq = useRef(0);

  const fetchHistory = useCallback(
    async (silent = false) => {
      const seq = ++requestSeq.current;
      if (!silent) setIsLoading(true);
      try {
        const data = await metricsApi.history(hostId, historyLimit, sinceHours);
        if (seq !== requestSeq.current) return;
        // limit mode returns newest-first; since_hours is already oldest-first
        setHistory(sinceHours ? data : [...data].reverse());
        setError(null);
      } catch (err: any) {
        if (seq !== requestSeq.current) return;
        setError(err.message ?? "Failed to fetch metrics");
      } finally {
        if (seq === requestSeq.current) setIsLoading(false);
      }
    },
    [hostId, historyLimit, sinceHours]
  );

  // Live updates over WebSocket, authenticated by a first frame, with auto-reconnect
  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      ws = new WebSocket(`${WS_BASE}/ws/metrics/${hostId}`);

      ws.onopen = () => {
        attempt = 0;
        setError(null);
        // The server expects the JWT as the first frame (keeps it out of logs)
        ws?.send(token);
      };

      ws.onmessage = (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.status) return; // e.g. {"status": "no_data"}

        const metric = data as Metric;
        setLive(metric);

        const { historyLimit: limit, sinceHours: hours } = rangeRef.current;
        if (hours && hours > 1) return; // bucketed ranges are refreshed by polling

        setHistory((prev) => {
          if (prev.length && prev[prev.length - 1].id === metric.id) return prev;
          const next = [...prev, metric];
          return next.slice(-(hours ? MAX_RAW_POINTS : limit));
        });
      };

      ws.onerror = () => setError("WebSocket connection failed");

      ws.onclose = (event) => {
        if (disposed || event.code === WS_CLOSE_UNAUTHORIZED) return;
        const delay = Math.min(1000 * 2 ** attempt++, 15_000);
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [hostId, token]);

  // Fetch on mount / range change
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Keep bucketed ranges fresh
  useEffect(() => {
    if (!sinceHours || sinceHours <= 1) return;
    const id = setInterval(() => fetchHistory(true), BUCKETED_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchHistory, sinceHours]);

  return { history, live, isLoading, error, refetch: () => fetchHistory() };
}
