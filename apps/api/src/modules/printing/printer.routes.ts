import { Router } from "express";

import type { Env } from "../../config/env.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import { createScopedRateLimiter } from "../../middleware/rateLimit.js";
import { createRequireAuth, createRequirePermission } from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { PrinterController } from "./printer.controller.js";
import { PrinterDiscoveryService } from "./printer-discovery.service.js";
import { PrinterTestService } from "./printer-test.service.js";
import { PrintingRepository } from "./printing.repository.js";
import { testPrinterConnectionBody } from "./printer.validation.js";

export function createPrinterRouter(env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(env);
  const requirePrinting = createRequirePermission(PermissionCodes.PRINTING_USE);
  const printerOpsLimiter = createScopedRateLimiter(env, undefined, {
    windowMs: 60 * 1000,
    limit: 30,
    message: "Too many printer operations",
  });

  const controller = new PrinterController(
    new PrinterDiscoveryService(),
    new PrinterTestService(),
    new PrintingRepository(),
  );

  router.get("/", requireAuth, requirePrinting, controller.list);
  router.get("/discover", requireAuth, requirePrinting, printerOpsLimiter, controller.discover);
  router.post(
    "/test",
    requireAuth,
    requirePrinting,
    printerOpsLimiter,
    validateRequest("body", testPrinterConnectionBody),
    controller.testConnection,
  );

  return router;
}
