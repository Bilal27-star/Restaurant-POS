import type { Request, Response } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import type { ShiftsService } from "./shifts.service.js";

export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  current = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.current(rid);
    sendSuccess(res, data, { message: "OK" });
  });

  open = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const uid = req.auth!.userId;
    const body = req.body as { openingCashFloat: string };
    const data = await this.service.open(rid, uid, body.openingCashFloat);
    sendSuccess(res, data, { message: "Shift opened", status: 201 });
  });

  close = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const uid = req.auth!.userId;
    const { shiftId } = req.params as { shiftId: string };
    const body = req.body as { closingCashCount: string; notes?: string | null };
    const data = await this.service.close(rid, uid, shiftId, body);
    sendSuccess(res, data, { message: "Shift closed" });
  });

  refund = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const uid = req.auth!.userId;
    const body = req.body as { shiftId: string; amount: string; notes?: string | null };
    const data = await this.service.recordRefund(rid, uid, body);
    sendSuccess(res, data, { message: "Refund recorded" });
  });
}
