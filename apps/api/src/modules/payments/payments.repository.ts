import type { OrderPaymentStatus, PaymentMethod, Prisma } from "@prisma/client";
import { CashTransactionType, Prisma as PrismaNs } from "@prisma/client";

import { money, moneyZero } from "../../core/orders/money.js";
import { prisma } from "../../prisma/index.js";
import { orderDetailInclude, type OrderWithRelations } from "../orders/orders.repository.js";

export type CapturePaymentInput = {
  restaurantId: string;
  orderId: string;
  expectedVersion: number | undefined;
  method: PaymentMethod;
  /** Ignored when `useRemainingBalance` is true (amount is computed from order total − net paid). */
  amount: Prisma.Decimal;
  amountReceived: Prisma.Decimal | null;
  recordedByUserId: string | null;
  idempotencyKey: string | null;
  /** When true and the order becomes fully paid, mark COMPLETED and free the table in the same transaction. */
  autoCompleteOrder: boolean;
  /** Full remaining balance is taken from the DB inside the transaction; client must not supply `amount`. */
  useRemainingBalance?: boolean;
};

export type CapturePaymentResult = {
  order: OrderWithRelations;
  payment: { id: string; method: PaymentMethod; amount: string; changeGiven: string | null; status: string };
  cashTransactionId: string | null;
  orderCompleted: boolean;
};

export type RefundPaymentInput = {
  restaurantId: string;
  paymentId: string;
  amount: Prisma.Decimal;
  reason: string | null;
  createdByUserId: string | null;
};

const SALE_IN = CashTransactionType.SALE_IN;
const REFUND_OUT = CashTransactionType.REFUND_OUT;

export class PaymentsRepository {
  async loadOrderForCapture(tx: Prisma.TransactionClient, restaurantId: string, orderId: string) {
    return tx.order.findFirst({
      where: { id: orderId, restaurantId },
      select: {
        id: true,
        version: true,
        closedAt: true,
        status: true,
        total: true,
        tableId: true,
        paymentStatus: true,
      },
    });
  }

  async findOpenShift(tx: Prisma.TransactionClient, restaurantId: string) {
    return tx.shift.findFirst({
      where: { restaurantId, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        grossSales: true,
        cashSalesTotal: true,
        cardSalesTotal: true,
        transferSalesTotal: true,
        refundsTotal: true,
      },
    });
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentResult> {
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(PrismaNs.sql`SELECT id FROM orders WHERE id = ${input.orderId}::uuid FOR UPDATE`);

        if (input.idempotencyKey) {
          const existingPay = await tx.payment.findFirst({
            where: { restaurantId: input.restaurantId, idempotencyKey: input.idempotencyKey },
            select: { id: true, orderId: true },
          });
          if (existingPay) {
            const order = await this.getOrderFull(tx, input.restaurantId, existingPay.orderId);
            const p = await tx.payment.findUnique({
              where: { id: existingPay.id },
              select: { id: true, method: true, amount: true, changeGiven: true, status: true },
            });
            return {
              order,
              payment: {
                id: p!.id,
                method: p!.method,
                amount: p!.amount.toFixed(2),
                changeGiven: p!.changeGiven?.toFixed(2) ?? null,
                status: p!.status,
              },
              cashTransactionId: null,
              orderCompleted: order.status === "COMPLETED",
            };
          }
        }

        const head = await this.loadOrderForCapture(tx, input.restaurantId, input.orderId);
        if (!head) {
          throw new Error("ORDER_NOT_FOUND");
        }
        if (head.closedAt) {
          throw new Error("ORDER_CLOSED");
        }
        if (head.status === "CANCELLED" || head.status === "COMPLETED") {
          throw new Error("ORDER_NOT_PAYABLE");
        }
        if (input.expectedVersion !== undefined && head.version !== input.expectedVersion) {
          throw new Error("VERSION_CONFLICT");
        }

        const netPaidBefore = await this.netPaidTowardOrder(tx, input.orderId);
        const balanceDue = head.total.sub(netPaidBefore);
        if (balanceDue.lte(moneyZero)) {
          throw new Error("NOTHING_OWED");
        }

        const paymentAmount = input.useRemainingBalance ? balanceDue : input.amount;
        if (!input.useRemainingBalance) {
          if (paymentAmount.gt(balanceDue)) {
            throw new Error("AMOUNT_EXCEEDS_BALANCE");
          }
          if (paymentAmount.lte(moneyZero)) {
            throw new Error("INVALID_AMOUNT");
          }
        }

        if (input.method === "CASH") {
          if (input.amountReceived === null || input.amountReceived === undefined) {
            throw new Error("CASH_TENDER_REQUIRED");
          }
          if (input.amountReceived.lt(paymentAmount)) {
            throw new Error("INSUFFICIENT_CASH");
          }
        }

        const shift = await this.findOpenShift(tx, input.restaurantId);
        if (!shift) {
          throw new Error("NO_OPEN_SHIFT");
        }

        const changeGiven =
          input.method === "CASH" && input.amountReceived !== null
            ? input.amountReceived.sub(paymentAmount)
            : null;

        const paymentRow = await tx.payment.create({
          data: {
            restaurantId: input.restaurantId,
            orderId: input.orderId,
            shiftId: shift.id,
            method: input.method,
            status: "COMPLETED",
            amount: paymentAmount,
            amountReceived: input.method === "CASH" ? input.amountReceived : null,
            changeGiven,
            idempotencyKey: input.idempotencyKey,
            recordedByUserId: input.recordedByUserId,
            processedAt: new Date(),
          },
        });

        const metadataJson: Prisma.InputJsonValue = {
          paymentId: paymentRow.id,
          orderId: input.orderId,
          method: input.method,
          recordedByUserId: input.recordedByUserId,
          ...(input.method === "CASH"
            ? {
                amountReceived: input.amountReceived?.toFixed(2) ?? null,
                changeGiven: changeGiven?.toFixed(2) ?? null,
              }
            : {}),
        };

        const cashTx = await tx.cashTransaction.create({
          data: {
            restaurantId: input.restaurantId,
            shiftId: shift.id,
            type: SALE_IN,
            amount: paymentAmount,
            paymentId: paymentRow.id,
            metadataJson,
          },
        });

        await this.incrementShiftSales(tx, shift.id, input.method, paymentAmount);

        const netPaid = await this.netPaidTowardOrder(tx, input.orderId);
        const paymentStatus = this.computeOrderPaymentStatus(netPaid, head.total);

        await tx.order.update({
          where: { id: input.orderId },
          data: {
            paidTotal: netPaid,
            paymentStatus,
            version: { increment: 1 },
          },
        });

        let orderCompleted = false;
        if (input.autoCompleteOrder && paymentStatus === "PAID") {
          await this.completePaidOrder(tx, input.restaurantId, input.orderId, head.tableId);
          orderCompleted = true;
        }

        const order = await this.getOrderFull(tx, input.restaurantId, input.orderId);
        return {
          order,
          payment: {
            id: paymentRow.id,
            method: paymentRow.method,
            amount: paymentRow.amount.toFixed(2),
            changeGiven: paymentRow.changeGiven?.toFixed(2) ?? null,
            status: paymentRow.status,
          },
          cashTransactionId: cashTx.id,
          orderCompleted,
        };
      },
      { isolationLevel: PrismaNs.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 },
    );
  }

  async refundPayment(input: RefundPaymentInput): Promise<{ order: OrderWithRelations; refundId: string }> {
    return prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findFirst({
          where: { id: input.paymentId, restaurantId: input.restaurantId },
          include: { refunds: true, shift: true },
        });
        if (!payment) {
          throw new Error("PAYMENT_NOT_FOUND");
        }
        if (payment.status !== "COMPLETED") {
          throw new Error("PAYMENT_NOT_REFUNDABLE");
        }

        const already = payment.refunds.reduce((s, r) => s.add(r.amount), moneyZero);
        const remaining = payment.amount.sub(already);
        if (input.amount.lte(moneyZero) || input.amount.gt(remaining)) {
          throw new Error("REFUND_AMOUNT_INVALID");
        }

        await tx.refund.create({
          data: {
            paymentId: payment.id,
            orderId: payment.orderId,
            amount: input.amount,
            reason: input.reason,
            createdByUserId: input.createdByUserId,
          },
        });

        if (payment.shiftId) {
          await this.decrementShiftSales(tx, payment.shiftId, payment.method, input.amount);
          await tx.shift.update({
            where: { id: payment.shiftId },
            data: { refundsTotal: { increment: input.amount } },
          });

          await tx.cashTransaction.create({
            data: {
              restaurantId: input.restaurantId,
              shiftId: payment.shiftId,
              type: REFUND_OUT,
              amount: input.amount.neg(),
              paymentId: payment.id,
              metadataJson: {
                refundOfPayment: payment.id,
                orderId: payment.orderId,
                reason: input.reason,
              },
            },
          });
        }

        const head = await tx.order.findFirst({
          where: { id: payment.orderId, restaurantId: input.restaurantId },
          select: { total: true },
        });
        if (!head) {
          throw new Error("ORDER_NOT_FOUND");
        }

        const netPaid = await this.netPaidTowardOrder(tx, payment.orderId);
        const paymentStatus = this.computeOrderPaymentStatus(netPaid, head.total);

        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            paidTotal: netPaid,
            paymentStatus,
            version: { increment: 1 },
          },
        });

        const order = await this.getOrderFull(tx, input.restaurantId, payment.orderId);
        const lastRefund = await tx.refund.findFirst({
          where: { paymentId: payment.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        return { order, refundId: lastRefund!.id };
      },
      { isolationLevel: PrismaNs.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 },
    );
  }

  async searchPayments(
    restaurantId: string,
    q: string,
    limit: number,
    offset: number,
  ): Promise<
    {
      id: string;
      method: PaymentMethod;
      status: string;
      amount: Prisma.Decimal;
      createdAt: Date;
      idempotencyKey: string | null;
      order: { id: string; orderNumber: string; table: { number: string } | null };
    }[]
  > {
    const term = q.trim();
    return prisma.payment.findMany({
      where: {
        restaurantId,
        OR: [
          { idempotencyKey: { contains: term, mode: "insensitive" } },
          { order: { orderNumber: { contains: term, mode: "insensitive" } } },
          { order: { ticketPublicCode: { contains: term, mode: "insensitive" } } },
          { order: { table: { number: { contains: term, mode: "insensitive" } } } },
        ],
      },
      select: {
        id: true,
        method: true,
        status: true,
        amount: true,
        createdAt: true,
        idempotencyKey: true,
        order: { select: { id: true, orderNumber: true, table: { select: { number: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  async getPaymentDetail(restaurantId: string, paymentId: string) {
    return prisma.payment.findFirst({
      where: { id: paymentId, restaurantId },
      include: {
        order: { include: orderDetailInclude },
        recordedBy: { select: { id: true, fullName: true } },
        refunds: { orderBy: { createdAt: "desc" } },
        cashTransactions: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
  }

  private async netPaidTowardOrder(tx: Prisma.TransactionClient, orderId: string): Promise<Prisma.Decimal> {
    const paid = await tx.payment.aggregate({
      where: { orderId, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const refunded = await tx.refund.aggregate({
      where: { orderId },
      _sum: { amount: true },
    });
    const p = paid._sum.amount ?? moneyZero;
    const r = refunded._sum.amount ?? moneyZero;
    return p.sub(r);
  }

  private computeOrderPaymentStatus(netPaid: Prisma.Decimal, orderTotal: Prisma.Decimal): OrderPaymentStatus {
    if (netPaid.lte(moneyZero)) {
      return "UNPAID";
    }
    if (netPaid.lt(orderTotal)) {
      return "PARTIALLY_PAID";
    }
    return "PAID";
  }

  private async incrementShiftSales(
    tx: Prisma.TransactionClient,
    shiftId: string,
    method: PaymentMethod,
    amount: Prisma.Decimal,
  ) {
    const base: Prisma.ShiftUpdateInput = {
      grossSales: { increment: amount },
    };
    if (method === "CASH") {
      base.cashSalesTotal = { increment: amount };
    } else if (method === "CARD") {
      base.cardSalesTotal = { increment: amount };
    } else {
      base.transferSalesTotal = { increment: amount };
    }
    await tx.shift.update({ where: { id: shiftId }, data: base });
  }

  private async decrementShiftSales(
    tx: Prisma.TransactionClient,
    shiftId: string,
    method: PaymentMethod,
    amount: Prisma.Decimal,
  ) {
    const base: Prisma.ShiftUpdateInput = {
      grossSales: { decrement: amount },
    };
    if (method === "CASH") {
      base.cashSalesTotal = { decrement: amount };
    } else if (method === "CARD") {
      base.cardSalesTotal = { decrement: amount };
    } else {
      base.transferSalesTotal = { decrement: amount };
    }
    await tx.shift.update({ where: { id: shiftId }, data: base });
  }

  private async completePaidOrder(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    orderId: string,
    tableId: string | null,
  ) {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "COMPLETED",
        closedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (tableId) {
      const t = await tx.restaurantTable.findUnique({
        where: { id: tableId },
        select: { currentOrderId: true },
      });
      if (t?.currentOrderId === orderId) {
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: { status: "FREE", currentOrderId: null, version: { increment: 1 } },
        });
      }
    }
  }

  private async getOrderFull(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    orderId: string,
  ): Promise<OrderWithRelations> {
    const o = await tx.order.findFirst({
      where: { id: orderId, restaurantId },
      include: orderDetailInclude,
    });
    if (!o) {
      throw new Error("ORDER_NOT_FOUND");
    }
    return o;
  }
}
