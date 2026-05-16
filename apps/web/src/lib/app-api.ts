import { createPosApiClient, type PosApiClient } from "@pos/api-client";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { isTauriDesktop } from "./desktop/tauri-host";

const ACCESS_KEY = "pos_access_token";

/** Local API port (see `apps/api` `PORT` / `.env.example`). Override host with `VITE_API_ORIGIN`. */
const DEFAULT_LOCAL_API_PORT = 4000;

let client: PosApiClient | null = null;

/**
 * Resolved API origin (scheme + host + port, no path). Used for REST, Socket.IO, and offline `/health`.
 * - `VITE_API_ORIGIN` wins when set.
 * - Tauri: fixed loopback host (no `window` during early init in some builds).
 * - Vite dev in the browser: use **same hostname** as the page (`localhost` vs `127.0.0.1`) so requests are not
 *   treated as cross-site vs `localhost:5173` → `127.0.0.1:4000` (cookies / PNA / devtools clarity).
 * - Production web build: empty string → same-origin as the deployed site (set `VITE_API_ORIGIN` if API is elsewhere).
 */
export function resolvedApiOrigin(): string {
  const v = import.meta.env.VITE_API_ORIGIN;
  if (typeof v === "string" && v.length > 0) return v.replace(/\/$/, "");
  if (isTauriDesktop()) {
    return `http://127.0.0.1:${DEFAULT_LOCAL_API_PORT}`;
  }
  if (import.meta.env.DEV) {
    if (typeof window !== "undefined") {
      const h = window.location.hostname;
      if (h) return `http://${h}:${DEFAULT_LOCAL_API_PORT}`;
    }
    return `http://127.0.0.1:${DEFAULT_LOCAL_API_PORT}`;
  }
  return "";
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

export function setAccessToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(ACCESS_KEY, token);
    else localStorage.removeItem(ACCESS_KEY);
  } catch {
    /* ignore */
  }
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
  if (isTauriDesktop() || isLocalApiOrigin(origin)) {
    return { "X-POS-Desktop-Client": "1" };
  }
  return {};
}

export function getAppApi(): PosApiClient {
  if (!client) {
    client = createPosApiClient({
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
      onUnauthorized: () => {
        setAccessToken(null);
      },
    });
  }
  return client;
}

export function resetAppApiClient(): void {
  client = null;
}
