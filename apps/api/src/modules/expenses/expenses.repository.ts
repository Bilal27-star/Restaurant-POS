import { CashTransactionType, Prisma } from "@prisma/client";

import { prisma } from "../../prisma/index.js";

export class ExpensesRepository {
  listCategories(restaurantId: string) {
    return prisma.expenseCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: "asc" },
    });
  }

  listByShift(restaurantId: string, shiftId: string) {
    return prisma.expense.findMany({
      where: { restaurantId, shiftId },
      orderBy: { createdAt: "desc" },
      include: { category: true, recordedBy: { select: { id: true, fullName: true, username: true } } },
    });
  }

  findCategory(restaurantId: string, categoryId: string) {
    return prisma.expenseCategory.findFirst({
      where: { id: categoryId, restaurantId },
      select: { id: true },
    });
  }

  async createExpense(input: {
    restaurantId: string;
    shiftId: string;
    categoryId: string;
    amount: Prisma.Decimal;
    description: string;
    paymentMethod: import("@prisma/client").PaymentMethod;
    recordedByUserId: string | null;
  }) {
    return prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          restaurantId: input.restaurantId,
          shiftId: input.shiftId,
          categoryId: input.categoryId,
          amount: input.amount,
          description: input.description,
          paymentMethod: input.paymentMethod,
          recordedByUserId: input.recordedByUserId,
        },
        include: { category: true, recordedBy: { select: { id: true, fullName: true, username: true } } },
      });

      const signed = new Prisma.Decimal(0).sub(input.amount);
      await tx.cashTransaction.create({
        data: {
          restaurantId: input.restaurantId,
          shiftId: input.shiftId,
          type: CashTransactionType.EXPENSE_OUT,
          amount: signed,
          expenseId: exp.id,
        },
      });

      return exp;
    });
  }
}
