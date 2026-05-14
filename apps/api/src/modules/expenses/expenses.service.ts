import type { PaymentMethod } from "@prisma/client";

import { ApiError } from "../../core/http/ApiError.js";
import { money } from "../../core/orders/money.js";
import { getRealtimeHub } from "../../realtime/registry.js";

import { ExpensesRepository } from "./expenses.repository.js";
import { ShiftsRepository } from "../shifts/shifts.repository.js";

export class ExpensesService {
  constructor(
    private readonly repo: ExpensesRepository,
    private readonly shiftsRepo: ShiftsRepository,
  ) {}

  categories(restaurantId: string) {
    return this.repo.listCategories(restaurantId);
  }

  list(restaurantId: string, shiftId: string) {
    return this.repo.listByShift(restaurantId, shiftId).then((rows) =>
      rows.map((e) => ({
        id: e.id,
        shiftId: e.shiftId,
        categoryId: e.categoryId,
        amount: e.amount.toFixed(2),
        description: e.description,
        paymentMethod: e.paymentMethod,
        createdAt: e.createdAt,
        category: e.category ? { id: e.category.id, name: e.category.name, code: e.category.code } : null,
        recordedBy: e.recordedBy,
      })),
    );
  }

  async create(
    restaurantId: string,
    userId: string,
    input: { shiftId: string; categoryId: string; amount: string; description: string; paymentMethod: PaymentMethod },
  ) {
    const shift = await this.shiftsRepo.findShift(restaurantId, input.shiftId);
    if (!shift || shift.status !== "OPEN") {
      throw ApiError.badRequest("Shift not found or not open");
    }
    const cat = await this.repo.findCategory(restaurantId, input.categoryId);
    if (!cat) {
      throw ApiError.badRequest("Expense category not found");
    }
    const amt = money(input.amount);
    if (amt.lte(money(0))) {
      throw ApiError.badRequest("Invalid amount");
    }
    const row = await this.repo.createExpense({
      restaurantId,
      shiftId: input.shiftId,
      categoryId: input.categoryId,
      amount: amt,
      description: input.description.trim(),
      paymentMethod: input.paymentMethod,
      recordedByUserId: userId,
    });
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["shifts"] });
    getRealtimeHub()?.emitAnalyticsTick(restaurantId, { reason: "expense:created" });
    void getRealtimeHub()?.publishShiftUpdatedById(restaurantId, input.shiftId);
    return {
      id: row.id,
      shiftId: row.shiftId,
      categoryId: row.categoryId,
      amount: row.amount.toFixed(2),
      description: row.description,
      paymentMethod: row.paymentMethod,
      createdAt: row.createdAt,
      category: row.category ? { id: row.category.id, name: row.category.name, code: row.category.code } : null,
      recordedBy: row.recordedBy,
    };
  }
}
