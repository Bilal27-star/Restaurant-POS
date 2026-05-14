import jwt from "jsonwebtoken";

import type { Env } from "../../config/env.js";
import type { RoleCode } from "@prisma/client";

export type AccessTokenPayload = {
  sub: string;
  rid: string;
  typ: "access";
  roles: RoleCode[];
  permissions: string[];
  sid: string;
};

export type RefreshTokenPayload = {
  sub: string;
  sid: string;
  typ: "refresh";
};

export class JwtTokenService {
  constructor(private readonly env: Env) {}

  signAccessToken(payload: Omit<AccessTokenPayload, "typ">): string {
    const body: AccessTokenPayload = { ...payload, typ: "access" };
    return jwt.sign(body, this.env.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      expiresIn: this.env.JWT_ACCESS_TTL_SEC,
      issuer: this.env.JWT_ISSUER,
    });
  }

  signRefreshToken(payload: Omit<RefreshTokenPayload, "typ">): string {
    const body: RefreshTokenPayload = { ...payload, typ: "refresh" };
    return jwt.sign(body, this.env.JWT_REFRESH_SECRET, {
      algorithm: "HS256",
      expiresIn: this.env.JWT_REFRESH_TTL_SEC,
      issuer: this.env.JWT_ISSUER,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, this.env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: this.env.JWT_ISSUER,
      clockTolerance: 30,
    });
    if (typeof decoded === "string" || !decoded || (decoded as AccessTokenPayload).typ !== "access") {
      throw new jwt.JsonWebTokenError("Invalid access token");
    }
    return decoded as AccessTokenPayload;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const decoded = jwt.verify(token, this.env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
      issuer: this.env.JWT_ISSUER,
      clockTolerance: 30,
    });
    if (typeof decoded === "string" || !decoded || (decoded as RefreshTokenPayload).typ !== "refresh") {
      throw new jwt.JsonWebTokenError("Invalid refresh token");
    }
    return decoded as RefreshTokenPayload;
  }
}
