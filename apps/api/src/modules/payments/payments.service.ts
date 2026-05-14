import type { PaymentMethod } from "@prisma/client";

import { ApiError } from "../../core/http/ApiError.js";
import { money } from "../../core/orders/money.js";
import { prisma } from "../../prisma/index.js";
import { getRealtimeHub } from "../../realtime/registry.js";
import type { OrderLifecycleEventV1 } from "../orders/orders.events.js";
import { OrdersRepository } from "../orders/orders.repository.js";
import { serializeOrderEntity } from "../orders/serialize-order.js";
import { computeCashChange } from "./cash-engine.js";
import type { PaymentCapturedEventV1, PaymentRefundedEventV1 } from "./payments.events.js";
import type { HardwarePrintOrchestrator } from "../printing/hardware-print-orchestrator.js";
import { PaymentsRepository } from "./payments.repository.js";
import { buildPaymentReceiptDto } from "./printing/payment-receipt-dtos.js";
import { toPrismaPaymentMethod } from "./payments.validation.js";

const payRepoErrors: Record<string, { status: number; message: string }> = {
  ORDER_NOT_FOUND: { status: 404, message: "Order not found" },
  ORDER_CLOSED: { status: 409, message: "Order is already closed" },
  ORDER_NOT_PAYABLE: { status: 409, message: "Payments cannot be applied to this order" },
  VERSION_CONFLICT: { status: 409, message: "Order was modified by another session (version mismatch)" },
  AMOUNT_EXCEEDS_BALANCE: { status: 400, message: "Payment amount exceeds remaining balance" },
  INVALID_AMOUNT: { status: 400, message: "Payment amount must be positive" },
  INSUFFICIENT_CASH: { status: 400, message: "Insufficient cash tendered for this payment" },
  CASH_TENDER_REQUIRED: { status: 400, message: "Cash payments require amountReceived" },
  NOTHING_OWED: { status: 409, message: "Nothing owed on this order" },
  NO_OPEN_SHIFT: { status: 409, message: "Open a cashier shift before recording payments" },
  PAYMENT_NOT_FOUND: { status: 404, message: "Payment not found" },
  PAYMENT_NOT_REFUNDABLE: { status: 409, message: "Payment cannot be refunded in its current state" },
  REFUND_AMOUNT_INVALID: { status: 400, message: "Invalid refund amount" },
};

function mapPayRepoError(err: unknown): never {
  if (err instanceof Error) {
    const mapped = payRepoErrors[err.message];
    if (mapped) {
      if (mapped.status === 404) {
        throw ApiError.notFound(mapped.message);
      }
      if (mapped.status === 409) {
        throw ApiError.conflict(mapped.message);
      }
      throw ApiError.badRequest(mapped.message);
    }
  }
  throw err;
}

export class PaymentsService {
  private readonly ordersRepo: OrdersRepository;

  constructor(
    private readonly repo: PaymentsRepository,
    ordersRepo?: OrdersRepository,
    private readonly hardwarePrint?: HardwarePrintOrchestrator | null,
  ) {
    this.ordersRepo = ordersRepo ?? new OrdersRepository();
  }

  private wrap<T>(p: Promise<T>): Promise<T> {
    return p.catch((e) => mapPayRepoError(e));
  }

  cashPreview(billStr: string, tenderedStr: string): unknown {
    const bill = money(billStr);
    const tendered = money(tenderedStr);
    if (bill.lt(money(0)) || tendered.lt(money(0))) {
      throw ApiError.badRequest("Bill and tendered amounts must be non-negative");
    }
    return computeCashChange(bill, tendered);
  }

  async capture(input: {
    restaurantId: string;
    actorUserId: string;
    orderId: string;
    method: PaymentMethod | string;
    amount: string;
    amountReceived?: string | null;
    orderVersion?: number;
    idempotencyKey?: string | null;
    autoCompleteOrder: boolean;
    useRemainingBalance?: boolean;
  }): Promise<unknown> {
    const method =
      typeof input.method === "string"
        ? toPrismaPaymentMethod(input.method as "CASH" | "CARD" | "TRANSFER" | "BANK_TRANSFER")
        : input.method;
    const useBal = Boolean(input.useRemainingBalance);
    const amt = useBal ? money("0") : money(input.amount);
    if (!useBal && amt.lte(money(0))) {
      throw ApiError.badRequest("Payment amount must be positive");
    }
    const received =
      input.amountReceived !== undefined && input.amountReceived !== null && input.amountReceived !== ""
        ? money(input.amountReceived)
        : null;

    const result = await this.wrap(
      this.repo.capturePayment({
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        expectedVersion: input.orderVersion,
        method,
        amount: amt,
        amountReceived: received,
        recordedByUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey ?? null,
        autoCompleteOrder: input.autoCompleteOrder,
        useRemainingBalance: useBal,
      }),
    );

    const payRow = await prisma.payment.findUnique({
      where: { id: result.payment.id },
      select: { shiftId: true },
    });

    const captured: PaymentCapturedEventV1 = {
      v: 1,
      phase: "PAYMENT_CAPTURED",
      restaurantId: input.restaurantId,
      orderId: result.order.id,
      paymentId: result.payment.id,
      shiftId: payRow?.shiftId ?? null,
      method: result.payment.method,
      amount: result.payment.amount,
      orderCompleted: result.orderCompleted,
      occurredAt: new Date().toISOString(),
    };

    let orderLifecycle: OrderLifecycleEventV1 | undefined;
    if (result.orderCompleted) {
      orderLifecycle = {
        v: 1,
        phase: "COMPLETED",
        restaurantId: result.order.restaurantId,
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        occurredAt: new Date().toISOString(),
        totals: {
          subtotal: result.order.subtotal.toFixed(2),
          total: result.order.total.toFixed(2),
          paidTotal: result.order.paidTotal.toFixed(2),
          paymentStatus: result.order.paymentStatus,
        },
      };
    }

    const analytics = {
      captured,
      ...(orderLifecycle ? { order: orderLifecycle } : {}),
    };

    const hub = getRealtimeHub();
    if (hub) {
      hub.publishPaymentCaptured({
        restaurantId: input.restaurantId,
        order: result.order,
        payment: result.payment,
        orderCompleted: result.orderCompleted,
        analytics,
        shiftId: payRow?.shiftId ?? null,
        idempotentReplay: result.cashTransactionId === null,
      });
    }

    if (this.hardwarePrint && result.cashTransactionId !== null) {
      this.hardwarePrint.scheduleReceiptAfterCapture({
        restaurantId: input.restaurantId,
        actorUserId: input.actorUserId,
        order: result.order,
        payment: result.payment,
        openCashDrawer: method === "CASH",
      });
    }

    return {
      order: serializeOrderEntity(result.order),
      payment: result.payment,
      cashTransactionId: result.cashTransactionId,
      orderCompleted: result.orderCompleted,
      analytics,
    };
  }

  /**
   * Full settlement in one step: remaining balance is computed inside a DB transaction (never trust client totals).
   * Creates payment, updates order payment state, completes order and frees table when balance hits zero.
   */
  async checkout(input: {
    restaurantId: string;
    actorUserId: string;
    orderId: string;
    method: string;
    cashReceived?: string | null;
    orderVersion?: number;
    idempotencyKey?: string | null;
  }): Promise<unknown> {
    const method = toPrismaPaymentMethod(input.method as "CASH" | "CARD" | "TRANSFER");
    if (method === "TRANSFER") {
      throw ApiError.badRequest("Checkout supports CASH or CARD only");
    }

    const base = await this.capture({
      restaurantId: input.restaurantId,
      actorUserId: input.actorUserId,
      orderId: input.orderId,
      method,
      amount: "0.00",
      amountReceived: method === "CASH" ? input.cashReceived ?? null : null,
      orderVersion: input.orderVersion,
      idempotencyKey: input.idempotencyKey ?? null,
      autoCompleteOrder: true,
      useRemainingBalance: true,
    });

    const payload = base as {
      payment: { id: string };
      order: unknown;
      cashTransactionId: string | null;
      orderCompleted: boolean;
      analytics: unknown;
    };

    const receipt = await this.paymentReceiptDocument(input.restaurantId, payload.payment.id);
    return { ...payload, receipt };
  }

  async search(restaurantId: string, q: string, limit: number, offset: number): Promise<unknown> {
    const rows = await this.repo.searchPayments(restaurantId, q, limit, offset);
    return rows.map((r) => ({
      id: r.id,
      method: r.method,
      status: r.status,
      amount: r.amount.toFixed(2),
      createdAt: r.createdAt,
      idempotencyKey: r.idempotencyKey,
      order: {
        id: r.order.id,
        orderNumber: r.order.orderNumber,
        tableNumber: r.order.table?.number ?? null,
      },
    }));
  }

  async getDetail(restaurantId: string, paymentId: string): Promise<unknown> {
    const p = await this.repo.getPaymentDetail(restaurantId, paymentId);
    if (!p) {
      throw ApiError.notFound("Payment not found");
    }
    return this.serializePaymentDetail(p);
  }

  async refund(input: {
    restaurantId: string;
    paymentId: string;
    amount: string;
    reason?: string | null;
    actorUserId: string;
  }): Promise<unknown> {
    const amt = money(input.amount);
    const { order, refundId } = await this.wrap(
      this.repo.refundPayment({
        restaurantId: input.restaurantId,
        paymentId: input.paymentId,
        amount: amt,
        reason: input.reason ?? null,
        createdByUserId: input.actorUserId,
      }),
    );
    const refunded: PaymentRefundedEventV1 = {
      v: 1,
      phase: "PAYMENT_REFUNDED",
      restaurantId: input.restaurantId,
      orderId: order.id,
      paymentId: input.paymentId,
      refundId,
      amount: amt.toFixed(2),
      occurredAt: new Date().toISOString(),
    };
    const payMeta = await prisma.payment.findUnique({
      where: { id: input.paymentId },
      select: { shiftId: true },
    });
    getRealtimeHub()?.publishPaymentRefunded({
      restaurantId: input.restaurantId,
      order,
      analytics: { refunded },
      shiftId: payMeta?.shiftId ?? null,
    });
    return {
      order: serializeOrderEntity(order),
      refundId,
      analytics: { refunded },
    };
  }

  async paymentReceiptDocument(restaurantId: string, paymentId: string): Promise<unknown> {
    const p = await this.repo.getPaymentDetail(restaurantId, paymentId);
    if (!p) {
      throw ApiError.notFound("Payment not found");
    }
    const name = await this.ordersRepo.findRestaurantName(restaurantId);
    const o = p.order;
    return buildPaymentReceiptDto({
      restaurantName: name,
      orderNumber: o.orderNumber,
      tableNumber: o.table?.number ?? null,
      paymentId: p.id,
      paymentMethod: p.method,
      amountApplied: p.amount,
      amountTendered: p.amountReceived,
      changeGiven: p.changeGiven,
      orderSubtotal: o.subtotal,
      orderTax: o.taxTotal,
      orderDiscount: o.discountTotal,
      orderTotal: o.total,
      netPaidAfter: o.paidTotal,
      items: o.items.map((it) => ({
        nameSnapshot: it.nameSnapshot,
        quantity: it.quantity,
        lineSubtotal: it.lineSubtotal,
        modifierLabels:
          it.modifiers.length > 0
            ? it.modifiers.map((m) => m.label).filter((s) => s.trim().length > 0).join(", ")
            : null,
      })),
    });
  }

  private serializePaymentDetail(p: NonNullable<Awaited<ReturnType<PaymentsRepository["getPaymentDetail"]>>>) {
    return {
      id: p.id,
      restaurantId: p.restaurantId,
      orderId: p.orderId,
      shiftId: p.shiftId,
      method: p.method,
      status: p.status,
      amount: p.amount.toFixed(2),
      amountReceived: p.amountReceived?.toFixed(2) ?? null,
      changeGiven: p.changeGiven?.toFixed(2) ?? null,
      idempotencyKey: p.idempotencyKey,
      processedAt: p.processedAt,
      createdAt: p.createdAt,
      recordedBy: p.recordedBy,
      cashTransactions: p.cashTransactions.map((c) => ({
        id: c.id,
        type: c.type,
        amount: c.amount.toFixed(2),
        createdAt: c.createdAt,
        metadataJson: c.metadataJson,
      })),
      refunds: p.refunds.map((r) => ({
        id: r.id,
        amount: r.amount.toFixed(2),
        reason: r.reason,
        createdAt: r.createdAt,
      })),
      order: serializeOrderEntity(p.order),
    };
  }
}
