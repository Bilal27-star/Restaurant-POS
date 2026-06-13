import { Router } from "express";

import type { Env } from "../../config/env.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import { createRequireActiveSession, createRequireAuth, createRequirePermission } from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersRepository } from "./orders.repository.js";
import { OrdersService } from "./orders.service.js";
import { HardwarePrintOrchestrator } from "../printing/hardware-print-orchestrator.js";
import { PaymentsRepository } from "../payments/payments.repository.js";
import { PrintingRepository } from "../printing/printing.repository.js";
import { PrintingService } from "../printing/printing.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import {
  addOrderLinesBody,
  cancelOrderBody,
  completeOrderBody,
  createOrderBody,
  deleteLineQuery,
  fullKitchenReprintBody,
  dispatchPendingKitchenBody,
  historyOrdersQuery,
  listOrdersQuery,
  orderIdParams,
  orderLineIdParams,
  patchOrderBody,
  patchOrderLineBody,
  recordPaymentBody,
  searchOrdersQuery,
} from "./orders.validation.js";

export function createOrdersRouter(env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(env);
  const requireOrdersRead = createRequirePermission(PermissionCodes.ORDERS_READ);
  const requireOrdersCreate = createRequirePermission(PermissionCodes.ORDERS_CREATE);
  const requireOrdersUpdate = createRequirePermission(PermissionCodes.ORDERS_UPDATE);
  const requirePayments = createRequirePermission(PermissionCodes.PAYMENTS_PROCESS);
  const requireActiveSession = createRequireActiveSession();

  const repository = new OrdersRepository();
  const paymentsRepository = new PaymentsRepository();
  const printingRepo = new PrintingRepository();
  const printingSvc = new PrintingService(printingRepo);
  const hardwarePrint = new HardwarePrintOrchestrator(printingSvc, printingRepo);
  const paymentsService = new PaymentsService(paymentsRepository, repository, hardwarePrint);
  const service = new OrdersService(repository, paymentsService, hardwarePrint);
  const controller = new OrdersController(service);

  router.post(
    "/",
    requireAuth,
    requireOrdersCreate,
    validateRequest("body", createOrderBody),
    controller.create,
  );

  router.get(
    "/",
    requireAuth,
    requireOrdersRead,
    validateRequest("query", listOrdersQuery),
    controller.listActive,
  );

  router.get(
    "/search",
    requireAuth,
    requireOrdersRead,
    validateRequest("query", searchOrdersQuery),
    controller.search,
  );

  router.get(
    "/history",
    requireAuth,
    requireOrdersRead,
    validateRequest("query", historyOrdersQuery),
    controller.history,
  );

  router.get(
    "/:orderId",
    requireAuth,
    requireOrdersRead,
    validateRequest("params", orderIdParams),
    controller.getById,
  );

  router.patch(
    "/:orderId",
    requireAuth,
    requireOrdersUpdate,
    validateRequest("params", orderIdParams),
    validateRequest("body", patchOrderBody),
    controller.patch,
  );

  router.post(
    "/:orderId/lines",
    requireAuth,
    requireOrdersUpdate,
    validateRequest("params", orderIdParams),
    validateRequest("body", addOrderLinesBody),
    controller.addLines,
  );

  router.patch(
    "/:orderId/lines/:lineId",
    requireAuth,
    requireOrdersUpdate,
    validateRequest("params", orderLineIdParams),
    validateRequest("body", patchOrderLineBody),
    controller.patchLine,
  );

  router.delete(
    "/:orderId/lines/:lineId",
    requireAuth,
    requireOrdersUpdate,
    validateRequest("params", orderLineIdParams),
    validateRequest("query", deleteLineQuery),
    controller.deleteLine,
  );

  router.post(
    "/:orderId/payments",
    requireAuth,
    requireActiveSession,
    requireOrdersUpdate,
    requirePayments,
    validateRequest("params", orderIdParams),
    validateRequest("body", recordPaymentBody),
    controller.pay,
  );

  router.post(
    "/:orderId/complete",
    requireAuth,
    requireActiveSession,
    requireOrdersUpdate,
    validateRequest("params", orderIdParams),
    validateRequest("body", completeOrderBody),
    controller.complete,
  );

  router.post(
    "/:orderId/cancel",
    requireAuth,
    requireActiveSession,
    requireOrdersUpdate,
    validateRequest("params", orderIdParams),
    validateRequest("body", cancelOrderBody),
    controller.cancel,
  );

  router.get(
    "/:orderId/kitchen/recovery",
    requireAuth,
    requireOrdersRead,
    validateRequest("params", orderIdParams),
    controller.getKitchenRecovery,
  );

  router.get(
    "/:orderId/kitchen/dispatch-audit",
    requireAuth,
    requireOrdersRead,
    validateRequest("params", orderIdParams),
    controller.getKitchenDispatchAudit,
  );

  router.post(
    "/:orderId/kitchen/dispatch-pending",
    requireAuth,
    requireOrdersUpdate,
    validateRequest("params", orderIdParams),
    validateRequest("body", dispatchPendingKitchenBody),
    controller.dispatchPendingKitchen,
  );

  router.post(
    "/:orderId/kitchen/full-reprint",
    requireAuth,
    requireOrdersUpdate,
    validateRequest("params", orderIdParams),
    validateRequest("body", fullKitchenReprintBody),
    controller.fullKitchenReprint,
  );

  router.get(
    "/:orderId/print/kitchen",
    requireAuth,
    requireOrdersRead,
    validateRequest("params", orderIdParams),
    controller.printKitchen,
  );

  router.get(
    "/:orderId/print/table",
    requireAuth,
    requireOrdersRead,
    validateRequest("params", orderIdParams),
    controller.printTable,
  );

  router.get(
    "/:orderId/print/receipt",
    requireAuth,
    requireOrdersRead,
    validateRequest("params", orderIdParams),
    controller.printReceipt,
  );

  return router;
}
