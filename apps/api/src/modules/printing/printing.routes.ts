import { Router } from "express";
import rateLimit from "express-rate-limit";

import type { Env } from "../../config/env.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import { createRequireActiveSession, createRequireAuth, createRequirePermission } from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { PrintingController } from "./printing.controller.js";
import { PrintingRepository } from "./printing.repository.js";
import { PrintingService } from "./printing.service.js";
import {
  createPrinterBody,
  dequeuePrintBody,
  enqueuePrintJobBody,
  failPrintJobBody,
  listPrintJobsQuery,
  printJobIdParams,
  printerIdParams,
  updatePrinterBody,
} from "./printing.validation.js";

export function createPrintingRouter(env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(env);
  const requirePrinting = createRequirePermission(PermissionCodes.PRINTING_USE);
  const requireActiveSession = createRequireActiveSession();
  const printWriteLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 90,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false as const, error: "Too many print operations" },
  });

  const repo = new PrintingRepository();
  const service = new PrintingService(repo);
  const controller = new PrintingController(service);

  router.post(
    "/render",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    validateRequest("body", enqueuePrintJobBody),
    controller.render,
  );

  router.post(
    "/jobs",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    validateRequest("body", enqueuePrintJobBody),
    controller.enqueue,
  );

  router.get(
    "/jobs",
    requireAuth,
    requirePrinting,
    validateRequest("query", listPrintJobsQuery),
    controller.listJobs,
  );

  router.post(
    "/worker/claim",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    validateRequest("body", dequeuePrintBody),
    controller.claim,
  );

  router.get(
    "/jobs/:jobId",
    requireAuth,
    requirePrinting,
    validateRequest("params", printJobIdParams),
    controller.getJob,
  );

  router.post(
    "/jobs/:jobId/complete",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    validateRequest("params", printJobIdParams),
    controller.completeJob,
  );

  router.post(
    "/jobs/:jobId/fail",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    validateRequest("params", printJobIdParams),
    validateRequest("body", failPrintJobBody),
    controller.failJob,
  );

  router.post(
    "/jobs/:jobId/cancel",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    validateRequest("params", printJobIdParams),
    controller.cancelJob,
  );

  router.get("/printers", requireAuth, requirePrinting, controller.listPrinters);

  router.post(
    "/printers",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    validateRequest("body", createPrinterBody),
    controller.createPrinter,
  );

  router.patch(
    "/printers/:printerId",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    validateRequest("params", printerIdParams),
    validateRequest("body", updatePrinterBody),
    controller.updatePrinter,
  );

  router.delete(
    "/printers/:printerId",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    validateRequest("params", printerIdParams),
    controller.deletePrinter,
  );

  router.post(
    "/printers/discover",
    requireAuth,
    requireActiveSession,
    requirePrinting,
    printWriteLimiter,
    controller.discoverPrinters,
  );

  return router;
}
