import type { Request, Response } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import { auditFromRequest } from "../audit/security-audit.service.js";
import type { PaymentsService } from "./payments.service.js";

export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  cashPreview = asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as { bill: string; tendered: string };
    const data = this.service.cashPreview(q.bill, q.tendered);
    sendSuccess(res, data, { message: "Cash change preview" });
  });

  checkout = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const body = req.body as {
      orderId: string;
      method: "CASH" | "CARD";
      cashReceived?: string | null;
      orderVersion?: number;
      idempotencyKey?: string | null;
    };
    const data = await this.service.checkout({
      restaurantId: auth.restaurantId,
      actorUserId: auth.userId,
      orderId: body.orderId,
      method: body.method,
      cashReceived: body.cashReceived,
      orderVersion: body.orderVersion,
      idempotencyKey: body.idempotencyKey,
    });
    const paymentId =
      data && typeof data === "object" && "payment" in data && (data as { payment?: { id?: string } }).payment?.id;
    auditFromRequest(req, {
      action: "payment.checkout",
      resourceType: "order",
      resourceId: body.orderId,
      metadataJson: { method: body.method, paymentId: paymentId ?? null },
    });
    sendSuccess(res, data, { message: "Checkout completed", status: 201 });
  });

  capture = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const body = req.body as {
      orderId: string;
      method: string;
      amount: string;
      amountReceived?: string | null;
      orderVersion?: number;
      idempotencyKey?: string | null;
      autoCompleteOrder?: boolean;
    };
    const data = await this.service.capture({
      restaurantId: auth.restaurantId,
      actorUserId: auth.userId,
      orderId: body.orderId,
      method: body.method,
      amount: body.amount,
      amountReceived: body.amountReceived,
      orderVersion: body.orderVersion,
      idempotencyKey: body.idempotencyKey,
      autoCompleteOrder: body.autoCompleteOrder ?? true,
    });
    sendSuccess(res, data, { message: "Payment captured", status: 201 });
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const q = req.query as unknown as { q: string; limit: number; offset: number };
    const data = await this.service.search(auth.restaurantId, q.q, q.limit, q.offset);
    sendSuccess(res, data, { message: "Payments" });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { paymentId } = req.params as { paymentId: string };
    const data = await this.service.getDetail(auth.restaurantId, paymentId);
    sendSuccess(res, data, { message: "Payment" });
  });

  refund = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { paymentId } = req.params as { paymentId: string };
    const body = req.body as { amount: string; reason?: string | null };
    const data = await this.service.refund({
      restaurantId: auth.restaurantId,
      paymentId,
      amount: body.amount,
      reason: body.reason,
      actorUserId: auth.userId,
    });
    auditFromRequest(req, {
      action: "payment.refund",
      resourceType: "payment",
      resourceId: paymentId,
      metadataJson: { amount: body.amount, reason: body.reason ?? null },
    });
    sendSuccess(res, data, { message: "Refund recorded", status: 201 });
  });

  receipt = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { paymentId } = req.params as { paymentId: string };
    const data = await this.service.paymentReceiptDocument(auth.restaurantId, paymentId);
    sendSuccess(res, data, { message: "Payment receipt document" });
  });

  reprintReceipt = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { paymentId } = req.params as { paymentId: string };
    const data = await this.service.reprintReceipt(auth.restaurantId, auth.userId, paymentId);
    sendSuccess(res, data, { message: "Receipt reprint queued" });
  });
}
