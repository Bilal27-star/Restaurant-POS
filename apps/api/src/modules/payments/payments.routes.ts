import { Router } from "express";

import type { Env } from "../../config/env.js";
import { createScopedRateLimiter } from "../../middleware/rateLimit.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import {
  createRequireActiveSession,
  createRequireAuth,
  createRequirePermission,
} from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { HardwarePrintOrchestrator } from "../printing/hardware-print-orchestrator.js";
import { OrdersRepository } from "../orders/orders.repository.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsRepository } from "./payments.repository.js";
import { PaymentsService } from "./payments.service.js";
import { PrintingRepository } from "../printing/printing.repository.js";
import { PrintingService } from "../printing/printing.service.js";
import {
  capturePaymentBody,
  cashPreviewQuery,
  checkoutPaymentBody,
  paymentIdParams,
  refundPaymentBody,
  searchPaymentsQuery,
} from "./payments.validation.js";

export function createPaymentsRouter(env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(env);
  const requirePayments = createRequirePermission(PermissionCodes.PAYMENTS_PROCESS);
  const requireRefund = createRequirePermission(PermissionCodes.PAYMENTS_REFUND);
  const requireActiveSession = createRequireActiveSession();
  const refundLimiter = createScopedRateLimiter(env, undefined, {
    windowMs: 60 * 60 * 1000,
    limit: 40,
    message: "Too many refund attempts",
  });

  const ordersRepo = new OrdersRepository();
  const paymentsRepo = new PaymentsRepository();
  const printingRepo = new PrintingRepository();
  const printingSvc = new PrintingService(printingRepo);
  const hardwarePrint = new HardwarePrintOrchestrator(printingSvc, printingRepo);
  const paymentsSvc = new PaymentsService(paymentsRepo, ordersRepo, hardwarePrint);
  const controller = new PaymentsController(paymentsSvc);

  router.post(
    "/checkout",
    requireAuth,
    requireActiveSession,
    requirePayments,
    validateRequest("body", checkoutPaymentBody),
    controller.checkout,
  );

  router.get(
    "/cash/preview",
    requireAuth,
    requirePayments,
    validateRequest("query", cashPreviewQuery),
    controller.cashPreview,
  );

  router.post(
    "/capture",
    requireAuth,
    requireActiveSession,
    requirePayments,
    validateRequest("body", capturePaymentBody),
    controller.capture,
  );

  router.get(
    "/search",
    requireAuth,
    requirePayments,
    validateRequest("query", searchPaymentsQuery),
    controller.search,
  );

  router.get(
    "/:paymentId",
    requireAuth,
    requirePayments,
    validateRequest("params", paymentIdParams),
    controller.getById,
  );

  router.post(
    "/:paymentId/refunds",
    requireAuth,
    requireActiveSession,
    requireRefund,
    refundLimiter,
    validateRequest("params", paymentIdParams),
    validateRequest("body", refundPaymentBody),
    controller.refund,
  );

  router.get(
    "/:paymentId/print/receipt",
    requireAuth,
    requirePayments,
    validateRequest("params", paymentIdParams),
    controller.receipt,
  );

  router.post(
    "/:paymentId/print/receipt",
    requireAuth,
    requirePayments,
    validateRequest("params", paymentIdParams),
    controller.reprintReceipt,
  );

  return router;
}
