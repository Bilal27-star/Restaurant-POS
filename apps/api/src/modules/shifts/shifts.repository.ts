import type { Prisma } from "@prisma/client";

import { prisma } from "../../prisma/index.js";

export class ShiftsRepository {
  findOpenShift(restaurantId: string) {
    return prisma.shift.findFirst({
      where: { restaurantId, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      include: {
        openedBy: { select: { id: true, fullName: true, username: true } },
        closedBy: { select: { id: true, fullName: true, username: true } },
        expenses: { orderBy: { createdAt: "desc" }, take: 50, include: { category: true } },
      },
    });
  }

  findShift(restaurantId: string, shiftId: string) {
    return prisma.shift.findFirst({
      where: { id: shiftId, restaurantId },
      select: { id: true, status: true },
    });
  }

  createShift(input: {
    restaurantId: string;
    openedByUserId: string;
    openingCashFloat: Prisma.Decimal;
  }) {
    return prisma.shift.create({
      data: {
        restaurantId: input.restaurantId,
        openedByUserId: input.openedByUserId,
        openingCashFloat: input.openingCashFloat,
        status: "OPEN",
      },
      include: {
        openedBy: { select: { id: true, fullName: true, username: true } },
      },
    });
  }

  async closeShift(input: {
    restaurantId: string;
    shiftId: string;
    closedByUserId: string;
    closingCashCount: Prisma.Decimal;
    notes?: string | null;
  }) {
    return prisma.shift.update({
      where: { id: input.shiftId, restaurantId: input.restaurantId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedByUserId: input.closedByUserId,
        closingCashCount: input.closingCashCount,
        notes: input.notes ?? null,
      },
      include: {
        openedBy: { select: { id: true, fullName: true, username: true } },
        closedBy: { select: { id: true, fullName: true, username: true } },
        expenses: { orderBy: { createdAt: "desc" }, take: 100, include: { category: true } },
      },
    });
  }

  listCashTransactions(restaurantId: string, shiftId: string) {
    return prisma.cashTransaction.findMany({
      where: { restaurantId, shiftId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  createCashTransaction(data: {
    restaurantId: string;
    shiftId: string;
    type: import("@prisma/client").CashTransactionType;
    amount: import("@prisma/client").Prisma.Decimal;
    label?: string | null;
  }) {
    return prisma.cashTransaction.create({
      data: {
        restaurantId: data.restaurantId,
        shiftId: data.shiftId,
        type: data.type,
        amount: data.amount,
        metadataJson: data.label ? { label: data.label } : undefined,
      },
    });
  }
}
