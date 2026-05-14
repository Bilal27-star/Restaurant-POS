import type { Request, Response } from "express";
import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import type { CustomersService } from "./customers.service.js";

export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.list(rid);
    sendSuccess(res, data);
  });

  search = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { q } = req.query as { q: string };
    const data = await this.service.search(rid, q || "");
    sendSuccess(res, data);
  });

  upsert = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const body = req.body as { id?: string; name: string; phone?: string; address?: string; notes?: string };
    const data = await this.service.upsert(rid, body);
    sendSuccess(res, data, { message: "Customer saved" });
  });
}
