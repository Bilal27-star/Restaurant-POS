import rateLimit from "express-rate-limit";

import type { Env } from "../config/env.js";

export function createDefaultRateLimiter(env: Env) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false as const, error: "Too many requests" },
  });
}

export function createAuthRateLimiter(env: Env) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false as const, error: "Too many authentication attempts" },
  });
}
