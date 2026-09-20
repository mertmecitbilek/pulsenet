/**
 * PulseNet — API Client
 *
 * Centralised Axios instance with base URL from env.
 * All API call functions are typed and documented here.
 */

import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 10_000,
});

export const TOKEN_STORAGE_KEY = "pulsenet_token";

// ---------------------------------------------------------------------------
// Auth header — read from storage on every request rather than captured in a
// React effect, which would race with pages that fetch on mount.
// ---------------------------------------------------------------------------
apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// 401 auto-logout interceptor
// AuthContext registers its logout fn here so the interceptor can call it.
// ---------------------------------------------------------------------------
let _logoutHandler: (() => void) | null = null;

export function setLogoutHandler(fn: () => void) {
  _logoutHandler = fn;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && _logoutHandler) {
      // Token expired or invalid — clear session and redirect to /login
      _logoutHandler();
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Host {
  id: string;
  name: string;
  ip_address: string;
  description: string | null;
  os: string | null;
  status: "online" | "offline" | "unknown";
  created_at: string;
  last_seen_at: string | null;
  alert_cpu_threshold: number;
  alert_memory_threshold: number;
  alert_disk_threshold: number;
}

export interface HostCreate {
  name: string;
  ip_address: string;
  description?: string;
  os?: string;
}

export interface Metric {
  id: string;
  host_id: string;
  timestamp: string;
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  disk_percent: number;
  disk_used_gb: number | null;
  disk_total_gb: number | null;
  uptime_seconds: number | null;
  net_bytes_sent: number | null;
  net_bytes_recv: number | null;
}

export interface Alert {
  id: string;
  host_id: string;
  host_name: string | null;
  metric_type: "cpu" | "memory" | "disk" | "host_down" | "check_down";
  check_id: string | null;
  severity: "warning" | "critical";
  value: number;
  threshold: number;
  message: string;
  status: "open" | "resolved";
  triggered_at: string;
  resolved_at: string | null;
  // Acknowledge
  acknowledged: boolean;
  ack_note: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

export type CheckType = "ping" | "http" | "tcp";

export interface ServiceCheck {
  id: string;
  host_id: string;
  name: string;
  type: CheckType;
  target: string | null;
  port: number | null;
  interval_seconds: number;
  timeout_seconds: number;
  fail_threshold: number;
  expected_status: number | null;
  enabled: boolean;
  state: "unknown" | "up" | "down";
  consecutive_failures: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_response_ms: number | null;
  last_error: string | null;
  created_at: string;
  uptime_24h: number | null;
}

export interface ServiceCheckCreate {
  host_id: string;
  name: string;
  type: CheckType;
  target?: string;
  port?: number;
  interval_seconds?: number;
  timeout_seconds?: number;
  fail_threshold?: number;
  expected_status?: number;
}

/** Fields a client may change on an existing check. */
export interface ServiceCheckUpdate {
  name?: string;
  target?: string | null;
  port?: number | null;
  interval_seconds?: number;
  timeout_seconds?: number;
  fail_threshold?: number;
  expected_status?: number | null;
  enabled?: boolean;
}

export interface CheckResult {
  id: string;
  timestamp: string;
  success: boolean;
  response_ms: number | null;
  error: string | null;
}

export const authApi = {
  /** Whether this instance still accepts new sign-ups (single-user by default). */
  registrationOpen: () =>
    apiClient
      .get<{ registration_open: boolean }>("/api/auth/registration-status")
      .then((r) => r.data.registration_open),
};

// ---------------------------------------------------------------------------
// Hosts API
// ---------------------------------------------------------------------------

export const hostsApi = {
  list: () => apiClient.get<Host[]>("/api/hosts/").then((r) => r.data),
  get: (id: string) => apiClient.get<Host>(`/api/hosts/${id}`).then((r) => r.data),
  create: (payload: HostCreate) =>
    apiClient.post<Host>("/api/hosts/", payload).then((r) => r.data),
  update: (id: string, payload: Partial<Host>) =>
    apiClient.patch<Host>(`/api/hosts/${id}`, payload).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/api/hosts/${id}`),
};

// ---------------------------------------------------------------------------
// Metrics API
// ---------------------------------------------------------------------------

export const metricsApi = {
  history: (hostId: string, limit = 60, sinceHours?: number) => {
    const params = sinceHours
      ? `since_hours=${sinceHours}`
      : `limit=${limit}`;
    return apiClient
      .get<Metric[]>(`/api/metrics/${hostId}?${params}`)
      .then((r) => r.data);
  },
  latest: (hostId: string) =>
    apiClient
      .get<Metric | null>(`/api/metrics/${hostId}/latest`)
      .then((r) => r.data),
  summary: () =>
    apiClient.get<Metric[]>("/api/metrics/summary").then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Alerts API
// ---------------------------------------------------------------------------

export const alertsApi = {
  list: (limit = 50) =>
    apiClient.get<Alert[]>(`/api/alerts/?limit=${limit}`).then((r) => r.data),
  openCount: () =>
    apiClient
      .get<{ open_alerts: number }>("/api/alerts/count/open")
      .then((r) => r.data.open_alerts),
  forHost: (hostId: string) =>
    apiClient.get<Alert[]>(`/api/alerts/${hostId}`).then((r) => r.data),
  acknowledge: (alertId: string, note?: string) =>
    apiClient
      .patch<Alert>(`/api/alerts/${alertId}/acknowledge`, { note: note ?? null })
      .then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Service Checks API (ping / HTTP / TCP)
// ---------------------------------------------------------------------------

export const checksApi = {
  list: (hostId?: string) =>
    apiClient
      .get<ServiceCheck[]>("/api/checks/", { params: hostId ? { host_id: hostId } : {} })
      .then((r) => r.data),
  create: (payload: ServiceCheckCreate) =>
    apiClient.post<ServiceCheck>("/api/checks/", payload).then((r) => r.data),
  update: (id: string, payload: ServiceCheckUpdate) =>
    apiClient.patch<ServiceCheck>(`/api/checks/${id}`, payload).then((r) => r.data),
  delete: (id: string) => apiClient.delete(`/api/checks/${id}`),
  runNow: (id: string) =>
    apiClient.post<ServiceCheck>(`/api/checks/${id}/run`).then((r) => r.data),
  results: (id: string, limit = 100) =>
    apiClient
      .get<CheckResult[]>(`/api/checks/${id}/results`, { params: { limit } })
      .then((r) => r.data),
};
