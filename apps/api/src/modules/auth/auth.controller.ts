import type { Request, Response } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import { ApiError } from "../../core/http/ApiError.js";
import { AuthService } from "./auth.service.js";
import { AuthRepository } from "./auth.repository.js";
import type { Env } from "../../config/env.js";

function requestMeta(req: Request) {
  return {
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  login = asyncHandler(async (req: Request, res: Response) => {
    const data = await this.auth.login(req.body, requestMeta(req), res);
    sendSuccess(res, data, { message: "Authenticated", status: 200 });
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const data = await this.auth.refresh(req, res, requestMeta(req));
    sendSuccess(res, data, { message: "Token refreshed", status: 200 });
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    const data = await this.auth.logout(req, res, requestMeta(req));
    sendSuccess(res, data, { message: "Logged out", status: 200 });
  });

  me = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.auth?.userId;
    if (!userId) {
      throw ApiError.unauthorized("Not authenticated");
    }
    const user = await this.auth.me(userId);
    sendSuccess(res, { user, auth: req.auth }, { message: "OK", status: 200 });
  });

  listSessions = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.auth?.userId;
    if (!userId) {
      throw ApiError.unauthorized("Not authenticated");
    }
    const sessions = await this.auth.listMySessions(userId);
    sendSuccess(res, { sessions }, { message: "Active sessions" });
  });
}

export function createAuthController(env: Env): AuthController {
  const repo = new AuthRepository();
  const service = new AuthService(env, repo);
  return new AuthController(service);
}
