import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";

import { isAuthThrottleDisabled, isLocalhostOrigin } from "../../config/desktop-runtime.js";
import type { Env } from "../../config/env.js";
import { ApiError } from "../../core/http/ApiError.js";
import { JwtTokenService } from "../../core/auth/jwt.service.js";
import { verifyPin } from "../../core/auth/pin.service.js";
import { verifyPassword } from "../../utils/password.js";
import {
  AuthRepository,
  collectPermissionCodes,
  collectRoleCodes,
  hashRefreshToken,
  isLoginAllowedStatus,
  type UserWithAuthRelations,
} from "./auth.repository.js";
import { clearRefreshTokenCookie, readRefreshTokenFromRequest, setRefreshTokenCookie } from "./auth.cookies.js";
import type { LoginBody } from "./auth.validation.js";

export type AuthRequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

export class AuthService {
  private readonly jwt: JwtTokenService;

  constructor(
    private readonly env: Env,
    private readonly repo: AuthRepository,
  ) {
    this.jwt = new JwtTokenService(env);
  }

  private async audit(input: {
    restaurantId: string;
    userId?: string | null;
    username: string;
    success: boolean;
    failureReason?: string | null;
    event?: string;
    meta: AuthRequestMeta;
  }) {
    await this.repo.appendLoginAudit({
      restaurantId: input.restaurantId,
      userId: input.userId,
      usernameAttempted: input.username,
      ipAddress: input.meta.ip ?? null,
      userAgent: input.meta.userAgent ?? null,
      success: input.success,
      failureReason: input.failureReason ?? null,
      event: input.event ?? "login",
    });
  }

  /** Cross-origin SPA/Tauri clients cannot rely on httpOnly cookies alone (SameSite + HTTP Secure). */
  private shouldExposeRefreshTokenInBody(req?: Request): boolean {
    if (this.env.AUTH_REFRESH_TOKEN_IN_BODY) return true;
    if (this.env.POS_DESKTOP_RUNTIME) return true;
    if (req && isLocalhostOrigin(req)) return true;
    return false;
  }

  private async handleFailedLogin(user: UserWithAuthRelations, restaurantId: string, meta: AuthRequestMeta) {
    await this.audit({
      restaurantId,
      userId: user.id,
      username: user.username,
      success: false,
      failureReason: "INVALID_CREDENTIALS",
      meta,
    });
    if (isAuthThrottleDisabled(this.env)) return;

    const next = user.failedLoginCount + 1;
    let lockedUntil: Date | null = user.lockedUntil;
    if (next >= this.env.AUTH_MAX_FAILED_LOGINS) {
      const lockMs = this.env.AUTH_LOCKOUT_MINUTES * 60_000;
      lockedUntil = lockMs > 0 ? new Date(Date.now() + lockMs) : null;
    }
    await this.repo.updateUserLockState(user.id, { failedLoginCount: next, lockedUntil });
    if (next >= this.env.AUTH_MAX_FAILED_LOGINS) {
      await this.audit({
        restaurantId,
        userId: user.id,
        username: user.username,
        success: false,
        failureReason: "LOCKOUT",
        event: "lockout",
        meta,
      });
    }
  }

  async login(body: LoginBody, meta: AuthRequestMeta, res: Response, req?: Request) {
    const restaurant = await this.repo.findRestaurantBySlug(body.restaurantSlug);
    if (!restaurant) {
      console.info("[LOGIN FAILED]", {
        reason: "UNKNOWN_TENANT",
        restaurantSlug: body.restaurantSlug,
        username: body.username,
      });
      throw ApiError.unauthorized("Invalid credentials");
    }

    const user = await this.repo.findUserForAuth(restaurant.id, body.username);
    if (!user) {
      await this.audit({
        restaurantId: restaurant.id,
        userId: null,
        username: body.username,
        success: false,
        failureReason: "UNKNOWN_USER",
        meta,
      });
      console.info("[LOGIN FAILED]", {
        restaurantId: restaurant.id,
        username: body.username,
        reason: "UNKNOWN_USER",
      });
      throw ApiError.unauthorized("Invalid credentials");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      if (isAuthThrottleDisabled(this.env)) {
        await this.repo.updateUserLockState(user.id, { failedLoginCount: 0, lockedUntil: null });
      } else {
        await this.audit({
          restaurantId: restaurant.id,
          userId: user.id,
          username: user.username,
          success: false,
          failureReason: "ACCOUNT_LOCKED",
          meta,
        });
        console.info("[LOGIN FAILED]", {
          restaurantId: restaurant.id,
          userId: user.id,
          username: user.username,
          reason: "ACCOUNT_LOCKED",
        });
        throw ApiError.forbidden("Account temporarily locked. Try again later.");
      }
    }

    if (!isLoginAllowedStatus(user.status)) {
      await this.audit({
        restaurantId: restaurant.id,
        userId: user.id,
        username: user.username,
        success: false,
        failureReason: `STATUS_${user.status}`,
        meta,
      });
      console.info("[LOGIN FAILED]", {
        restaurantId: restaurant.id,
        userId: user.id,
        username: user.username,
        reason: `STATUS_${user.status}`,
      });
      throw ApiError.forbidden("Account cannot sign in with the current status.");
    }

    let valid = false;
    if (body.password) {
      valid = await verifyPassword(body.password, user.hashedPassword);
    } else if (body.pin) {
      valid = await verifyPin(body.pin, user.pinHash, this.env);
    }

    if (!valid) {
      console.info("[LOGIN FAILED]", {
        restaurantId: restaurant.id,
        userId: user.id,
        username: user.username,
        reason: "INVALID_CREDENTIALS",
      });
      await this.handleFailedLogin(user, restaurant.id, meta);
      throw ApiError.unauthorized("Invalid credentials");
    }

    await this.repo.updateUserLockState(user.id, { failedLoginCount: 0, lockedUntil: null });
    await this.audit({
      restaurantId: restaurant.id,
      userId: user.id,
      username: user.username,
      success: true,
      meta,
    });

    console.info("[LOGIN SUCCESS]", {
      restaurantId: restaurant.id,
      userId: user.id,
      username: user.username,
    });
    return this.mintSessionAndTokens(user, meta, res, req);
  }

  private async mintSessionAndTokens(
    user: UserWithAuthRelations,
    meta: AuthRequestMeta,
    res: Response,
    req?: Request,
  ) {
    const sessionId = randomUUID();
    const refreshToken = this.jwt.signRefreshToken({ sub: user.id, sid: sessionId });
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.env.JWT_REFRESH_TTL_SEC * 1000);

    await this.repo.createSession({
      id: sessionId,
      userId: user.id,
      tokenHash,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ip ?? null,
      expiresAt,
    });

    const roles = collectRoleCodes(user);
    const permissions = collectPermissionCodes(user);
    const accessToken = this.jwt.signAccessToken({
      sub: user.id,
      rid: user.restaurantId,
      roles,
      permissions,
      sid: sessionId,
    });

    setRefreshTokenCookie(res, this.env, refreshToken);

    return {
      accessToken,
      expiresIn: this.env.JWT_ACCESS_TTL_SEC,
      refreshToken: this.shouldExposeRefreshTokenInBody(req) ? refreshToken : undefined,
      tokenType: "Bearer" as const,
      user: {
        id: user.id,
        restaurantId: user.restaurantId,
        username: user.username,
        fullName: user.fullName,
        status: user.status,
        roles,
        permissions,
      },
    };
  }

  async refresh(req: Request, res: Response, meta: AuthRequestMeta) {
    const raw = readRefreshTokenFromRequest(req);
    if (!raw) {
      throw ApiError.unauthorized("Missing refresh token");
    }

    let payload: { sub: string; sid: string };
    try {
      payload = this.jwt.verifyRefreshToken(raw);
    } catch {
      throw ApiError.unauthorized("Invalid or expired refresh token");
    }

    const session = await this.repo.findSessionById(payload.sid);
    if (!session || session.userId !== payload.sub) {
      throw ApiError.unauthorized("Invalid session");
    }
    if (session.expiresAt < new Date()) {
      throw ApiError.unauthorized("Session expired");
    }
    const expectedHash = hashRefreshToken(raw);
    if (session.tokenHash !== expectedHash) {
      throw ApiError.unauthorized("Invalid session");
    }

    const fullUser = await this.repo.findUserByIdWithRoles(session.userId);
    if (!fullUser) {
      throw ApiError.unauthorized("User not found");
    }

    if (!isLoginAllowedStatus(fullUser.status)) {
      throw ApiError.forbidden("Account cannot sign in with the current status.");
    }

    const newRefresh = this.jwt.signRefreshToken({ sub: fullUser.id, sid: session.id });
    const newHash = hashRefreshToken(newRefresh);
    const newExpires = new Date(Date.now() + this.env.JWT_REFRESH_TTL_SEC * 1000);
    await this.repo.updateSessionToken(session.id, newHash, newExpires);

    const roles = collectRoleCodes(fullUser);
    const permissions = collectPermissionCodes(fullUser);
    const accessToken = this.jwt.signAccessToken({
      sub: fullUser.id,
      rid: fullUser.restaurantId,
      roles,
      permissions,
      sid: session.id,
    });

    setRefreshTokenCookie(res, this.env, newRefresh);

    await this.audit({
      restaurantId: fullUser.restaurantId,
      userId: fullUser.id,
      username: fullUser.username,
      success: true,
      failureReason: null,
      event: "refresh",
      meta,
    });

    return {
      accessToken,
      expiresIn: this.env.JWT_ACCESS_TTL_SEC,
      refreshToken: this.shouldExposeRefreshTokenInBody(req) ? newRefresh : undefined,
      tokenType: "Bearer" as const,
    };
  }

  async logout(req: Request, res: Response, meta: AuthRequestMeta) {
    const raw = readRefreshTokenFromRequest(req);
    clearRefreshTokenCookie(res, this.env);
    if (!raw) {
      return { loggedOut: true as const };
    }
    try {
      const payload = this.jwt.verifyRefreshToken(raw);
      const session = await this.repo.findSessionById(payload.sid);
      if (session && session.userId === payload.sub) {
        const expectedHash = hashRefreshToken(raw);
        if (session.tokenHash === expectedHash) {
          await this.repo.revokeSession(session.id);
          const u = await this.repo.getUserPublic(session.userId);
          if (u?.restaurantId) {
            await this.audit({
              restaurantId: u.restaurantId,
              userId: session.userId,
              username: u.username,
              success: true,
              failureReason: null,
              event: "logout",
              meta,
            });
          }
        }
      }
    } catch {
      /* ignore invalid token on logout */
    }
    return { loggedOut: true as const };
  }

  async me(userId: string) {
    const full = await this.repo.findUserByIdWithRoles(userId);
    if (!full) {
      throw ApiError.unauthorized("User not found");
    }
    const roles = collectRoleCodes(full);
    const permissions = collectPermissionCodes(full);
    return {
      id: full.id,
      restaurantId: full.restaurantId,
      username: full.username,
      fullName: full.fullName,
      status: full.status,
      roles,
      permissions,
    };
  }

  async listMySessions(userId: string) {
    return this.repo.listSessionsForUser(userId);
  }
}
