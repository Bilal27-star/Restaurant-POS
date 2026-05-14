import { Router } from "express";

import type { Env } from "../../config/env.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import { createRequireAuth, createRequirePermission } from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { AnalyticsController } from "./analytics.controller.js";
import { AnalyticsRepository } from "./analytics.repository.js";
import { AnalyticsService } from "./analytics.service.js";
import {
  analyticsDateRangeQuery,
  analyticsOverviewQuery,
  analyticsRevenueQuery,
  analyticsTopItemsQuery,
} from "./analytics.validation.js";

export function createAnalyticsRouter(_env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(_env);
  const requireAnalytics = createRequirePermission(PermissionCodes.ANALYTICS_ACCESS);

  const repo = new AnalyticsRepository();
  const service = new AnalyticsService(repo);
  const controller = new AnalyticsController(service);

  router.get("/overview", requireAuth, requireAnalytics, validateRequest("query", analyticsOverviewQuery), controller.overview);
  router.get("/dashboard", requireAuth, requireAnalytics, controller.dashboard);
  router.get(
    "/revenue",
    requireAuth,
    requireAnalytics,
    validateRequest("query", analyticsRevenueQuery),
    controller.revenue,
  );
  router.get(
    "/top-items",
    requireAuth,
    requireAnalytics,
    validateRequest("query", analyticsTopItemsQuery),
    controller.topItems,
  );
  router.get(
    "/payments",
    requireAuth,
    requireAnalytics,
    validateRequest("query", analyticsDateRangeQuery),
    controller.payments,
  );
  router.get(
    "/tables",
    requireAuth,
    requireAnalytics,
    validateRequest("query", analyticsDateRangeQuery),
    controller.tables,
  );
  router.get(
    "/peak-hours",
    requireAuth,
    requireAnalytics,
    validateRequest("query", analyticsDateRangeQuery),
    controller.peakHours,
  );

  return router;
}
