import rateLimit from "express-rate-limit";
import { Router } from "express";

import type { Env } from "../../config/env.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { createAuthController } from "./auth.controller.js";
import { loginBodySchema, logoutBodySchema, refreshBodySchema } from "./auth.validation.js";
import { createRequireAuth } from "../../middleware/requireAuth.js";

export function createAuthRouter(env: Env): Router {
  const router = Router();
  const ctrl = createAuthController(env);
  const requireAuth = createRequireAuth(env);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false as const, error: "Too many login attempts" },
  });

  const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 80,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false as const, error: "Too many refresh attempts" },
  });

  router.post("/login", loginLimiter, validateRequest("body", loginBodySchema), ctrl.login);
  router.post("/refresh", refreshLimiter, validateRequest("body", refreshBodySchema), ctrl.refresh);
  router.post("/logout", validateRequest("body", logoutBodySchema), ctrl.logout);
  router.get("/me", requireAuth, ctrl.me);
  router.get("/sessions", requireAuth, ctrl.listSessions);

  return router;
}
