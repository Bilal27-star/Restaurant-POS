import type { Prisma } from "@prisma/client";

import { ApiError } from "../../core/http/ApiError.js";
import { money } from "../../core/orders/money.js";
import { getRealtimeHub } from "../../realtime/registry.js";

import { ShiftsRepository } from "./shifts.repository.js";

type ShiftRow = Prisma.ShiftGetPayload<{
  include: {
    openedBy: { select: { id: true; fullName: true; username: true } };
    closedBy: { select: { id: true; fullName: true; username: true } };
    expenses: { include: { category: true } };
  };
}>;

function serializeShift(row: ShiftRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    openingCashFloat: row.openingCashFloat.toFixed(2),
    closingCashCount: row.closingCashCount?.toFixed(2) ?? null,
    grossSales: row.grossSales.toFixed(2),
    cashSalesTotal: row.cashSalesTotal.toFixed(2),
    cardSalesTotal: row.cardSalesTotal.toFixed(2),
    transferSalesTotal: row.transferSalesTotal.toFixed(2),
    refundsTotal: row.refundsTotal.toFixed(2),
    openedBy: row.openedBy,
    closedBy: row.closedBy ?? null,
    expenses: row.expenses.map((e) => ({
      id: e.id,
      amount: e.amount.toFixed(2),
      description: e.description,
      paymentMethod: e.paymentMethod,
      createdAt: e.createdAt,
      category: e.category ? { id: e.category.id, name: e.category.name, code: e.category.code } : null,
    })),
  };
}

export class ShiftsService {
  constructor(private readonly repo: ShiftsRepository) {}

  async current(restaurantId: string) {
    const row = await this.repo.findOpenShift(restaurantId);
    if (!row) {
      return { shift: null as null, cashTransactions: [] as ReturnType<typeof this.mapTxs> };
    }
    const txs = await this.repo.listCashTransactions(restaurantId, row.id);
    return {
      shift: serializeShift(row as ShiftRow),
      cashTransactions: this.mapTxs(txs),
    };
  }

  private mapTxs(txs: Awaited<ReturnType<ShiftsRepository["listCashTransactions"]>>) {
    return txs.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount.toFixed(2),
      createdAt: t.createdAt,
      paymentId: t.paymentId,
      expenseId: t.expenseId,
      orderId: t.payment?.orderId ?? null,
      orderType: t.payment?.order?.type ?? null,
      paymentMethod: t.payment?.method ?? null,
    }));
  }

  async open(restaurantId: string, userId: string, openingCashFloat: string) {
    const existing = await this.repo.findOpenShift(restaurantId);
    if (existing) {
      throw ApiError.conflict("A shift is already open");
    }
    const floatAmt = money(openingCashFloat);
    if (floatAmt.lt(money(0))) {
      throw ApiError.badRequest("Invalid opening float");
    }
    await this.repo.createShift({
      restaurantId,
      openedByUserId: userId,
      openingCashFloat: floatAmt,
    });
    const full = await this.repo.findOpenShift(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["shifts"] });
    if (full) {
      void getRealtimeHub()?.publishShiftUpdatedById(restaurantId, full.id);
    }
    return serializeShift(full as ShiftRow | null);
  }

  async close(
    restaurantId: string,
    userId: string,
    shiftId: string,
    input: { closingCashCount: string; notes?: string | null },
  ) {
    const open = await this.repo.findOpenShift(restaurantId);
    if (!open || open.id !== shiftId) {
      throw ApiError.badRequest("Shift not found or not the active open shift");
    }
    const closing = money(input.closingCashCount);
    if (closing.lt(money(0))) {
      throw ApiError.badRequest("Invalid closing count");
    }
    const closed = await this.repo.closeShift({
      restaurantId,
      shiftId,
      closedByUserId: userId,
      closingCashCount: closing,
      notes: input.notes,
    });
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["shifts"] });
    void getRealtimeHub()?.publishShiftUpdatedById(restaurantId, shiftId);
    return serializeShift(closed as ShiftRow);
  }

  async recordRefund(
    restaurantId: string,
    userId: string,
    input: { shiftId: string; amount: string; notes?: string | null },
  ) {
    const shift = await this.repo.findShift(restaurantId, input.shiftId);
    if (!shift || shift.status !== "OPEN") {
      throw ApiError.badRequest("Active shift not found");
    }
    const amt = money(input.amount);
    if (amt.lte(money(0))) {
      throw ApiError.badRequest("Amount must be positive");
    }
    await this.repo.createCashTransaction({
      restaurantId,
      shiftId: input.shiftId,
      type: "REFUND_OUT",
      amount: amt.neg(),
      label: input.notes || "Remboursement",
    });
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["shifts"] });
    return { success: true };
  }
}
