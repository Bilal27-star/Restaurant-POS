import type { Response } from "express";

import type { Env } from "../../config/env.js";

const COOKIE = "pos_refresh_token";

export function refreshCookiePath(env: Env): string {
  return `${env.API_BASE_PATH}/auth`;
}

export function setRefreshTokenCookie(res: Response, env: Env, token: string): void {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: env.JWT_REFRESH_TTL_SEC * 1000,
    path: refreshCookiePath(env),
  });
}

export function clearRefreshTokenCookie(res: Response, env: Env): void {
  res.clearCookie(COOKIE, { path: refreshCookiePath(env) });
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
