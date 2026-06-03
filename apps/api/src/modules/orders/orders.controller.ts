import type { Response } from "express";
import type { Request } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import { auditFromRequest } from "../audit/security-audit.service.js";
import type { OrdersService } from "./orders.service.js";

export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  create = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const body = req.body as {
      type: "DINE_IN" | "TAKEAWAY";
      tableId?: string | null;
      customerId?: string | null;
      waiterId?: string | null;
      waiterName?: string | null;
      partySize?: number | null;
      kitchenNotes?: string | null;
      customerNotes?: string | null;
      clientMutationId?: string | null;
      taxTotal?: string;
      discountTotal?: string;
      lines: {
        menuItemId: string;
        quantity: number;
        modifierIds?: string[];
        removedIngredientIds?: string[];
        kitchenNotes?: string | null;
      }[];
    };
    const data = await this.service.createOrder({
      restaurantId: auth.restaurantId,
      actorUserId: auth.userId,
      type: body.type,
      tableId: body.tableId ?? null,
      customerId: body.customerId ?? null,
      waiterId: body.waiterId ?? null,
      waiterName: body.waiterName ?? null,
      partySize: body.partySize ?? null,
      kitchenNotes: body.kitchenNotes ?? null,
      customerNotes: body.customerNotes ?? null,
      clientMutationId: body.clientMutationId ?? null,
      taxTotal: body.taxTotal,
      discountTotal: body.discountTotal,
      lines: body.lines.map((l) => ({
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        modifierIds: l.modifierIds ?? [],
        removedIngredientIds: l.removedIngredientIds ?? [],
        kitchenNotes: l.kitchenNotes ?? null,
      })),
    });
    sendSuccess(res, data, { message: "Order created", status: 201 });
  });

  listActive = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const q = req.query as unknown as {
      type?: "DINE_IN" | "TAKEAWAY";
      status?: "PENDING" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
      tableId?: string;
      limit: number;
      offset: number;
    };
    const data = await this.service.listActive(auth.restaurantId, q);
    sendSuccess(res, data, { message: "Active orders" });
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const q = req.query as unknown as { q: string; limit: number; offset: number };
    const data = await this.service.search(auth.restaurantId, q.q, q.limit, q.offset);
    sendSuccess(res, data, { message: "Search results" });
  });

  history = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const q = req.query as unknown as {
      type?: "DINE_IN" | "TAKEAWAY";
      status?: "COMPLETED" | "CANCELLED";
      from?: Date;
      to?: Date;
      limit: number;
      offset: number;
    };
    const data = await this.service.history(auth.restaurantId, q);
    sendSuccess(res, data, { message: "Order history" });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const data = await this.service.getById(auth.restaurantId, orderId);
    sendSuccess(res, data, { message: "Order" });
  });

  patch = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const body = req.body as {
      version?: number;
      kitchenNotes?: string | null;
      customerNotes?: string | null;
      status?: "PENDING" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
      customerId?: string | null;
      waiterId?: string | null;
      waiterName?: string | null;
      partySize?: number | null;
      taxTotal?: string | null;
      discountTotal?: string | null;
    };
    const { version, ...patch } = body;
    const data = await this.service.patchOrder({
      restaurantId: auth.restaurantId,
      orderId,
      actorUserId: auth.userId,
      version,
      patch,
    });
    sendSuccess(res, data, { message: "Order updated" });
  });

  addLines = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const body = req.body as {
      version?: number;
      clientMutationId?: string | null;
      lines: {
        menuItemId: string;
        quantity: number;
        modifierIds?: string[];
        removedIngredientIds?: string[];
        kitchenNotes?: string | null;
      }[];
    };
    const data = await this.service.addLines({
      restaurantId: auth.restaurantId,
      orderId,
      actorUserId: auth.userId,
      version: body.version,
      clientMutationId: body.clientMutationId ?? null,
      lines: body.lines.map((l) => ({
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        modifierIds: l.modifierIds ?? [],
        removedIngredientIds: l.removedIngredientIds ?? [],
        kitchenNotes: l.kitchenNotes ?? null,
      })),
    });
    sendSuccess(res, data, { message: "Lines added" });
  });

  patchLine = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId, lineId } = req.params as { orderId: string; lineId: string };
    const body = req.body as {
      version?: number;
      clientMutationId?: string | null;
      quantity?: number;
      modifierIds?: string[];
      removedIngredientIds?: string[];
      kitchenNotes?: string | null;
    };
    const { version, ...patch } = body;
    const data = await this.service.updateLine({
      restaurantId: auth.restaurantId,
      orderId,
      lineId,
      actorUserId: auth.userId,
      version,
      clientMutationId: body.clientMutationId ?? null,
      patch,
    });
    sendSuccess(res, data, { message: "Line updated" });
  });

  deleteLine = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId, lineId } = req.params as { orderId: string; lineId: string };
    const q = req.query as unknown as { version?: number; clientMutationId?: string | null };
    const data = await this.service.deleteLine({
      restaurantId: auth.restaurantId,
      orderId,
      lineId,
      actorUserId: auth.userId,
      version: q.version,
      clientMutationId: q.clientMutationId ?? null,
    });
    sendSuccess(res, data, { message: "Line removed" });
  });

  pay = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const body = req.body as {
      version?: number;
      method: "CASH" | "CARD" | "TRANSFER";
      amount: string;
      amountReceived?: string | null;
      idempotencyKey?: string | null;
    };
    const data = await this.service.recordPayment({
      restaurantId: auth.restaurantId,
      orderId,
      version: body.version,
      method: body.method,
      amount: body.amount,
      amountReceived: body.amountReceived,
      idempotencyKey: body.idempotencyKey,
      recordedByUserId: auth.userId,
    });
    sendSuccess(res, data, { message: "Payment recorded" });
  });

  complete = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const body = (req.body ?? {}) as { version?: number };
    const data = await this.service.completeOrder({
      restaurantId: auth.restaurantId,
      orderId,
      version: body.version,
    });
    sendSuccess(res, data, { message: "Order completed" });
  });

  cancel = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const body = (req.body ?? {}) as { version?: number };
    const data = await this.service.cancelOrder({
      restaurantId: auth.restaurantId,
      orderId,
      version: body.version,
    });
    auditFromRequest(req, {
      action: "order.cancelled",
      resourceType: "order",
      resourceId: orderId,
    });
    sendSuccess(res, data, { message: "Order cancelled" });
  });

  printKitchen = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const data = await this.service.printKitchen(auth.restaurantId, orderId);
    sendSuccess(res, data, { message: "Kitchen ticket document" });
  });

  printTable = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const data = await this.service.printTable(auth.restaurantId, orderId);
    sendSuccess(res, data, { message: "Table ticket document" });
  });

  printReceipt = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const data = await this.service.printReceipt(auth.restaurantId, orderId);
    sendSuccess(res, data, { message: "Receipt document" });
  });

  getKitchenRecovery = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const data = await this.service.getKitchenRecovery(auth.restaurantId, orderId);
    sendSuccess(res, data, { message: "Kitchen recovery diagnostics" });
  });

  getKitchenDispatchAudit = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const data = await this.service.getKitchenDispatchAudit(auth.restaurantId, orderId);
    sendSuccess(res, data, { message: "Kitchen dispatch audit log" });
  });

  dispatchPendingKitchen = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const body = req.body as { clientMutationId: string; version?: number };
    const data = await this.service.dispatchPendingKitchen({
      restaurantId: auth.restaurantId,
      orderId,
      actorUserId: auth.userId,
      clientMutationId: body.clientMutationId,
      version: body.version,
    });
    sendSuccess(res, data, { message: "Pending kitchen changes dispatched" });
  });

  fullKitchenReprint = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { orderId } = req.params as { orderId: string };
    const body = req.body as { clientMutationId: string; lineIds?: string[] };
    const data = await this.service.fullKitchenReprint({
      restaurantId: auth.restaurantId,
      orderId,
      actorUserId: auth.userId,
      clientMutationId: body.clientMutationId,
      lineIds: body.lineIds,
    });
    sendSuccess(res, data, { message: "Kitchen full reprint dispatched" });
  });
}
