import type { Request, Response } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import type { NavigationService } from "./navigation.service.js";

export class NavigationController {
  constructor(private readonly service: NavigationService) {}

  counts = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.counts(rid);
    sendSuccess(res, data, { message: "OK" });
  });
}
