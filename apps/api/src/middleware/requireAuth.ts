import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { RoleCode } from "@prisma/client";

import type { Env } from "../config/env.js";
import { ApiError } from "../core/http/ApiError.js";
import { JwtTokenService } from "../core/auth/jwt.service.js";
import { prisma } from "../prisma/index.js";

export function createRequireAuth(env: Env): RequestHandler {
  const jwt = new JwtTokenService(env);
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(ApiError.unauthorized("Missing bearer token"));
      return;
    }
    const raw = header.slice("Bearer ".length).trim();
    if (!raw) {
      next(ApiError.unauthorized("Missing bearer token"));
      return;
    }
    try {
      const payload = jwt.verifyAccessToken(raw);
      req.auth = {
        userId: payload.sub,
        restaurantId: payload.rid,
        sessionId: payload.sid,
        roles: payload.roles,
        permissions: payload.permissions,
      };
      next();
    } catch {
      next(ApiError.unauthorized("Invalid or expired access token"));
    }
  };
}

export function createRequireRole(...allowed: RoleCode[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(ApiError.unauthorized("Not authenticated"));
      return;
    }
    const ok = req.auth.roles.some((r) => allowed.includes(r));
    if (!ok) {
      next(ApiError.forbidden("Insufficient role"));
      return;
    }
    next();
  };
}

export function createRequirePermission(...required: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(ApiError.unauthorized("Not authenticated"));
      return;
    }
    const set = new Set(req.auth.permissions);
    const missing = required.filter((p) => !set.has(p));
    if (missing.length > 0) {
      next(ApiError.forbidden("Insufficient permissions", { missing }));
      return;
    }
    next();
  };
}

/** Caller must hold at least one of the listed permissions (OR semantics). */
export function createRequireAnyPermission(...alternatives: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(ApiError.unauthorized("Not authenticated"));
      return;
    }
    if (alternatives.length === 0) {
      next();
      return;
    }
    const set = new Set(req.auth.permissions);
    const ok = alternatives.some((p) => set.has(p));
    if (!ok) {
      next(ApiError.forbidden("Insufficient permissions", { missing: alternatives }));
      return;
    }
    next();
  };
}

/**
 * Ensures the JWT session row is still active (not revoked, not expired).
 * Use on high-risk routes so revoked refresh/logout invalidates in-flight access tokens quickly.
 */
export function createRequireActiveSession(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      next(ApiError.unauthorized("Not authenticated"));
      return;
    }
    try {
      const s = await prisma.session.findFirst({
        where: {
          id: req.auth.sessionId,
          userId: req.auth.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!s) {
        next(ApiError.unauthorized("Session is no longer valid"));
        return;
      }
      next();
    } catch {
      next(ApiError.internal("Session validation failed"));
    }
  };
}
