import type { Request } from "express";

import type { Env } from "./env.js";

/** True when the API runs inside the packaged Tauri embedded Node runtime. */
export function isDesktopRuntimeEnv(raw: NodeJS.ProcessEnv = process.env): boolean {
  const flag = raw.POS_DESKTOP_RUNTIME?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  const bundle = raw.POS_BUNDLE_ROOT?.trim();
  if (bundle && bundle.length > 0) return true;
  return false;
}

/**
 * Local `pnpm run dev:api` / Tauri dev: mark process as desktop before `loadEnv()` so
 * HTTP rate limits and account lockouts stay off without a separate `.env` flag.
 */
export function configureDesktopApiProcessEnv(raw: NodeJS.ProcessEnv = process.env): void {
  if (isDesktopRuntimeEnv(raw)) return;
  const nodeEnv = raw.NODE_ENV?.trim() ?? "development";
  if (nodeEnv !== "production") {
    raw.POS_DESKTOP_RUNTIME = "1";
  }
}

export function isLoopbackClientAddress(ip: string | undefined | null): boolean {
  if (!ip) return false;
  const normalized = ip.trim().toLowerCase();
  if (normalized === "127.0.0.1" || normalized === "::1" || normalized === "localhost") return true;
  if (normalized.startsWith("::ffff:127.0.0.1")) return true;
  return false;
}

const LOCAL_ORIGIN_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "tauri.localhost",
]);

/** Browser / Tauri webview origins that always target a local API. */
export function isLocalhostOrigin(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === "tauri:" || protocol === "asset:") return true;
    return LOCAL_ORIGIN_HOSTS.has(hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function resolveClientIp(req: Request): string | undefined {
  return req.ip || req.socket?.remoteAddress || undefined;
}

/**
 * Auth HTTP throttling and persisted account lockouts are disabled for local desktop / offline POS.
 * Remote cloud deployments (production, no desktop flag) keep protection.
 */
export function isAuthThrottleDisabled(env: Env): boolean {
  if (isDesktopRuntimeEnv() || env.POS_DESKTOP_RUNTIME) return true;
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return true;
  return false;
}

/** When false, global/auth express-rate-limit middleware is not mounted (in-memory store never used). */
export function shouldEnableHttpRateLimiting(env: Env): boolean {
  return !isAuthThrottleDisabled(env);
}

/**
 * Defense-in-depth for production APIs hit via loopback (tunnel, local admin).
 * No-op when HTTP limiting is already disabled at mount time.
 */
export function isLocalApiHost(req: Request): boolean {
  const raw = req.get("host") ?? req.hostname ?? "";
  const host = raw.split(":")[0]?.trim().toLowerCase() ?? "";
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
}

export function isDesktopClientRequest(req: Request): boolean {
  const marker = req.get("x-pos-desktop-client")?.trim().toLowerCase();
  return marker === "1" || marker === "true" || marker === "yes";
}

export function shouldSkipRateLimitForRequest(req: Request, env: Env): boolean {
  if (!shouldEnableHttpRateLimiting(env)) return true;
  if (isDesktopClientRequest(req)) return true;
  if (isLocalApiHost(req)) return true;
  if (isLoopbackClientAddress(resolveClientIp(req))) return true;
  if (isLocalhostOrigin(req)) return true;
  return false;
}
