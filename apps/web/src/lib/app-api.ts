import { createPosApiClient, type PosApiClient } from "@pos/api-client";
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
    try {
      const res = await fetch(`${origin}/health`, { cache: "no-store" });
      if (res.ok) return { ok: true };
    } catch {
      /* backend still booting */
    }
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

export function getAppApi(): PosApiClient {
  if (!client) {
    client = createPosApiClient({
      baseUrl: apiBaseUrl(),
      getAccessToken: () => getAccessToken(),
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
