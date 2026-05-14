import type { Request, Response } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import type { ExpensesService } from "./expenses.service.js";

export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  categories = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.categories(rid);
    sendSuccess(res, data, { message: "OK" });
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { shiftId } = req.query as { shiftId: string };
    const data = await this.service.list(rid, shiftId);
    sendSuccess(res, data, { message: "OK" });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const uid = req.auth!.userId;
    const body = req.body as {
      shiftId: string;
      categoryId: string;
      amount: string;
      description: string;
      paymentMethod: import("@prisma/client").PaymentMethod;
    };
    const data = await this.service.create(rid, uid, body);
    sendSuccess(res, data, { message: "Expense recorded", status: 201 });
  });
}
