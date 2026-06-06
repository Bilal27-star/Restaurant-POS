import type { Response } from "express";

import type { Env } from "../../config/env.js";

const COOKIE = "pos_refresh_token";

export function refreshCookiePath(env: Env): string {
  return `${env.API_BASE_PATH}/auth`;
}

/**
 * Packaged desktop and local dev use plain HTTP — `Secure` cookies are dropped by browsers/webviews.
 * Cross-origin Tauri/LAN clients also rely on refresh tokens in JSON, not cookies alone.
 */
export function refreshCookieOptions(env: Env): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax";
  maxAge: number;
  path: string;
} {
  const localRuntime = Boolean(env.POS_DESKTOP_RUNTIME) || env.NODE_ENV !== "production";
  return {
    httpOnly: true,
    secure: !localRuntime,
    sameSite: localRuntime ? "lax" : "strict",
    maxAge: env.JWT_REFRESH_TTL_SEC * 1000,
    path: refreshCookiePath(env),
  };
}

export function setRefreshTokenCookie(res: Response, env: Env, token: string): void {
  res.cookie(COOKIE, token, refreshCookieOptions(env));
}

export function clearRefreshTokenCookie(res: Response, env: Env): void {
  const { path, secure, sameSite, httpOnly } = refreshCookieOptions(env);
  res.clearCookie(COOKIE, { path, secure, sameSite, httpOnly });
}

export function readRefreshTokenFromRequest(req: {
  cookies?: Record<string, string | undefined>;
  body?: { refreshToken?: string };
}): string | undefined {
  const fromCookie = req.cookies?.[COOKIE];
  if (typeof fromCookie === "string" && fromCookie.length > 0) {
    return fromCookie;
  }
  const fromBody = req.body?.refreshToken;
  if (typeof fromBody === "string" && fromBody.length > 0) {
    return fromBody;
  }
  return undefined;
}
