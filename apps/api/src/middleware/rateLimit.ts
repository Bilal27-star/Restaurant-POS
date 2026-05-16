import type { Request, RequestHandler, Response } from "express";
import rateLimit, { type Options } from "express-rate-limit";

import {
  shouldEnableHttpRateLimiting,
  shouldSkipRateLimitForRequest,
} from "../config/desktop-runtime.js";
import type { Env } from "../config/env.js";
import type { RootLogger } from "../config/logger.js";

const REMOTE_GLOBAL_WINDOW_MS = 15 * 60 * 1000;
const REMOTE_GLOBAL_LIMIT = 300;
const REMOTE_AUTH_WINDOW_MS = 15 * 60 * 1000;
const REMOTE_AUTH_LIMIT = 30;

type LimiterKind = "global" | "auth" | "scoped";

export const noopRateLimiter: RequestHandler = (_req, _res, next) => {
  next();
};

function buildRateLimitOptions(
  env: Env,
  logger: RootLogger | undefined,
  kind: LimiterKind,
  remote: { windowMs: number; limit: number; message: string },
): Partial<Options> {
  return {
    windowMs: remote.windowMs,
    limit: remote.limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false as const, error: remote.message },
    skip: (req) => shouldSkipRateLimitForRequest(req, env),
    handler: (req: Request, res: Response, _next, options) => {
      logger?.warn(
        {
          domain: kind === "auth" ? "auth" : "api",
          rateLimit: kind,
          ip: req.ip,
          path: req.path,
          method: req.method,
          windowMs: remote.windowMs,
          limit: remote.limit,
        },
        "rate_limit_exceeded",
      );
      res.status(options.statusCode).json(options.message);
    },
  };
}

function createRemoteLimiter(
  env: Env,
  logger: RootLogger | undefined,
  kind: LimiterKind,
  remote: { windowMs: number; limit: number; message: string },
): RequestHandler {
  if (!shouldEnableHttpRateLimiting(env)) {
    return noopRateLimiter;
  }
  return rateLimit(buildRateLimitOptions(env, logger, kind, remote));
}

export function createDefaultRateLimiter(env: Env, logger?: RootLogger): RequestHandler {
  return createRemoteLimiter(env, logger, "global", {
    windowMs: env.RATE_LIMIT_WINDOW_MS || REMOTE_GLOBAL_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX || REMOTE_GLOBAL_LIMIT,
    message: "Too many requests",
  });
}

export function createAuthRateLimiter(env: Env, logger?: RootLogger): RequestHandler {
  return createRemoteLimiter(env, logger, "auth", {
    windowMs: env.RATE_LIMIT_WINDOW_MS || REMOTE_AUTH_WINDOW_MS,
    limit: env.AUTH_RATE_LIMIT_MAX || REMOTE_AUTH_LIMIT,
    message: "Too many authentication attempts",
  });
}

/** Route-scoped limiter (refunds, print writes) — disabled with the same rules as auth/global. */
export function createScopedRateLimiter(
  env: Env,
  logger: RootLogger | undefined,
  remote: { windowMs: number; limit: number; message: string },
): RequestHandler {
  return createRemoteLimiter(env, logger, "scoped", remote);
}
