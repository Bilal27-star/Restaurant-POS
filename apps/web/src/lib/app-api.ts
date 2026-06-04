import { createPosApiClient, type PosApiClient } from "@pos/api-client";
import {
  clearLanApiConfig,
  getLanApiConfig,
  getResolvedApiOrigin,
  setLanApiConfig,
} from "@/lib/lan-api-config";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { applySanitizedOrdersApi } from "@/lib/orders-api";
import { isTauriDesktop } from "./desktop/tauri-host";

const ACCESS_KEY = "pos_access_token";
const ACCESS_EXPIRES_KEY = "pos_access_expires_at";

let client: PosApiClient | null = null;
let refreshInflight: Promise<string | null> | null = null;
let onSessionRefreshed: ((token: string) => void) | null = null;
let onSessionInvalidated: (() => void) | null = null;
let clientOrigin: string | null = null;
const API_RUNTIME_REFRESH_EVENT = "pos-api-runtime-refresh";

export function resolvedApiOrigin(): string {
  return getResolvedApiOrigin();
}

async function fetchHealthOk(origin: string, requestTimeoutMs: number): Promise<boolean> {
  const base = origin.replace(/\/$/, "");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), requestTimeoutMs);
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store", signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** In-flight or completed successful wait; cleared only after a failure so callers can retry. */
let desktopBackendReadyInflight: Promise<void> | null = null;

/**
 * Resolves when the embedded API is up (`pos_backend_status.ready`, `pos-backend-ready`, or `/health`).
 * Rejects on `pos-backend-exit`, `pos-backend-startup-timeout`, or timeout.
 */
export async function ensureDesktopBackendReady(options?: { timeoutMs?: number }): Promise<void> {
  if (getLanApiConfig().mode === "remote") return;
  if (!isTauriDesktop()) return;
  const origin = resolvedApiOrigin();
  if (!origin) return;
  if (import.meta.env.DEV) {
    const h = await waitForBackendHealth({
      timeoutMs: options?.timeoutMs ?? 45_000,
      pollMs: 500,
    });
    if (!h.ok) {
      throw new Error(
        "Tauri dev: local API is not reachable. Start the API (e.g. `pnpm run dev:api`) so it listens on port 4000.",
      );
    }
    return;
  }
  if (!desktopBackendReadyInflight) {
    const timeoutMs = options?.timeoutMs ?? 120_000;
    desktopBackendReadyInflight = runDesktopBackendReadyWait(origin, timeoutMs).catch((e) => {
      desktopBackendReadyInflight = null;
      throw e;
    });
  }
  await desktopBackendReadyInflight;
}

async function runDesktopBackendReadyWait(origin: string, timeoutMs: number): Promise<void> {
  const { listen } = await import("@tauri-apps/api/event");
  const { invoke } = await import("@tauri-apps/api/core");
  const unsubs: Array<() => void> = [];
  let fatal: Error | undefined;
  let sawReadyEvent = false;

  const cleanup = () => {
    for (const u of unsubs) {
      try {
        u();
      } catch {
        /* ignore */
      }
    }
    unsubs.length = 0;
  };

  void listen("pos-backend-exit", (ev) => {
    const p = ev.payload as { spawnFailed?: boolean; lastSpawnError?: string };
    fatal = new Error(
      p?.spawnFailed
        ? `Backend failed to start: ${p.lastSpawnError ?? "unknown error"}`
        : "Backend process exited before the API became reachable.",
    );
  }).then((u) => unsubs.push(u));

  void listen("pos-backend-startup-timeout", (ev) => {
    const p = ev.payload as { port?: number; logPath?: string; timeoutSec?: number };
    const logHint = p?.logPath ? ` Log file: ${p.logPath}` : "";
    fatal = new Error(
      `Local API did not respond on /health within ${String(p?.timeoutSec ?? "?")}s (advertised port ${String(p?.port ?? "?")}).${logHint}`,
    );
  }).then((u) => unsubs.push(u));

  void listen("pos-backend-ready", () => {
    sawReadyEvent = true;
  }).then((u) => unsubs.push(u));

  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      if (fatal) throw fatal;
      if (sawReadyEvent && (await fetchHealthOk(origin, 2500))) return;

      try {
        const st = await invoke<{ ready?: boolean }>("pos_backend_status");
        if (st.ready && (await fetchHealthOk(origin, 2500))) return;
      } catch {
        /* invoke may fail briefly during shell init */
      }

      if (await fetchHealthOk(origin, 2500)) return;
      await new Promise((r) => setTimeout(r, 400));
    }
    if (fatal) throw fatal;
    throw new Error("Timed out waiting for the local POS server.");
  } finally {
    cleanup();
  }
}

/**
 * Blocks until `GET {origin}/health` succeeds or `timeoutMs` elapses.
 * Use on the desktop login path so the UI matches a backend that is actually reachable (not only a fixed origin string).
 */
export async function waitForBackendHealth(options?: {
  timeoutMs?: number;
  pollMs?: number;
}): Promise<{ ok: true } | { ok: false; origin: string }> {
  const origin = resolvedApiOrigin();
  if (!origin) return { ok: true };
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const pollMs = options?.pollMs ?? 400;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fetchHealthOk(origin, Math.min(2500, pollMs + 800))) return { ok: true };
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { ok: false, origin };
}

function apiBaseUrl(): string {
  return resolvedApiOrigin();
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null, expiresInSec?: number): void {
  try {
    if (token) {
      localStorage.setItem(ACCESS_KEY, token);
      if (expiresInSec != null && expiresInSec > 0) {
        localStorage.setItem(ACCESS_EXPIRES_KEY, String(Date.now() + expiresInSec * 1000));
      }
    } else {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(ACCESS_EXPIRES_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getAccessTokenExpiresAtMs(): number | null {
  try {
    const raw = localStorage.getItem(ACCESS_EXPIRES_KEY);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** AuthProvider registers handlers so refresh/401 stay in sync with React session state. */
export function registerSessionLifecycle(handlers: {
  onRefreshed?: (token: string) => void;
  onInvalidated?: () => void;
}): void {
  onSessionRefreshed = handlers.onRefreshed ?? null;
  onSessionInvalidated = handlers.onInvalidated ?? null;
}

function invalidateSession(): void {
  setAccessToken(null);
  onSessionInvalidated?.();
}

/**
 * Exchanges the httpOnly refresh cookie for a new access token (no Bearer on this call).
 * Serialized so concurrent 401s share one refresh.
 */
export async function refreshSessionAccessToken(): Promise<string | null> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    const origin = apiBaseUrl().replace(/\/$/, "");
    if (!origin) return null;
    try {
      const res = await fetch(`${origin}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { accessToken?: string; expiresIn?: number };
      };
      if (!res.ok || !json.success || !json.data?.accessToken) {
        return null;
      }
      const token = json.data.accessToken;
      setAccessToken(token, json.data.expiresIn);
      onSessionRefreshed?.(token);
      return token;
    } catch {
      return null;
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

/** Refresh when the access token is within `leadMs` of expiry (long desktop sessions). */
export async function refreshSessionAccessTokenIfExpiring(leadMs = 120_000): Promise<boolean> {
  const expiresAt = getAccessTokenExpiresAtMs();
  if (expiresAt == null) return false;
  if (Date.now() + leadMs < expiresAt) return false;
  const token = await refreshSessionAccessToken();
  return token != null;
}

function isLocalApiOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function buildDesktopRequestHeaders(): Record<string, string> {
  const origin = resolvedApiOrigin();
  if (isLocalApiOrigin(origin)) {
    return { "X-POS-Desktop-Client": "1" };
  }
  return {};
}

export function getAppApi(): PosApiClient {
  const origin = apiBaseUrl();
  if (client && clientOrigin !== origin) {
    resetAppApiClient();
  }
  if (!client) {
    clientOrigin = origin;
    client = applySanitizedOrdersApi(
      createPosApiClient({
        baseUrl: apiBaseUrl(),
        getAccessToken: () => getAccessToken(),
        getRequestHeaders: buildDesktopRequestHeaders,
        onHttpTrace: ({ url, method, status }) => {
          if (!url.includes("/analytics/dashboard") && !url.includes("/tables/") && !url.includes("/menu/")) {
            return;
          }
          const event = url.includes("/menu/")
            ? "pos_menu_http_trace"
            : url.includes("/tables/")
              ? "tables_http_trace"
              : "dashboard_http_trace";
          logDataFlow(event, {
            url,
            method,
            status,
            throttled: status === 429,
          });
        },
        refreshAccessToken: () => refreshSessionAccessToken(),
        onUnauthorized: () => {
          invalidateSession();
        },
      }),
    );
  }
  return client;
}

export function resetAppApiClient(): void {
  client = null;
  clientOrigin = null;
}

export async function refreshApiRuntime(): Promise<void> {
  const previousOrigin = clientOrigin ?? resolvedApiOrigin();
  resetAppApiClient();
  const nextOrigin = resolvedApiOrigin();

  try {
    const { appQueryClient } = await import("./app-query-client");
    await appQueryClient.invalidateQueries();
  } catch {
    /* ignore query refresh failures */
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(API_RUNTIME_REFRESH_EVENT, {
        detail: { previousOrigin, nextOrigin },
      }),
    );
  }
}

declare global {
  interface Window {
    __POS_GET_API_CONFIG__?: () => { mode: "local" | "remote"; host: string; port: number };
    __POS_SET_REMOTE_API__?: (host: string, port?: number) => void;
    __POS_SET_LOCAL_API__?: () => void;
  }
}

if (typeof window !== "undefined") {
  window.__POS_GET_API_CONFIG__ = () => getLanApiConfig();
  window.__POS_SET_REMOTE_API__ = (host: string, port = 4000) => {
    setLanApiConfig({ mode: "remote", host, port });
    void refreshApiRuntime();
  };
  window.__POS_SET_LOCAL_API__ = () => {
    clearLanApiConfig();
    void refreshApiRuntime();
  };
}
