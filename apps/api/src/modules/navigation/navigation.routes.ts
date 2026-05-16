import { Router } from "express";

import type { Env } from "../../config/env.js";
import { createRequireAuth } from "../../middleware/requireAuth.js";
import { NavigationController } from "./navigation.controller.js";
import { NavigationService } from "./navigation.service.js";

/** Sidebar / shell operational counts. */
export function createNavigationRouter(_env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(_env);

  const service = new NavigationService();
  const controller = new NavigationController(service);

  router.get("/counts", requireAuth, controller.counts);

  return router;
}
