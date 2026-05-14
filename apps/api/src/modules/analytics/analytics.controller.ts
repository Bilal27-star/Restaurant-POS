import type { Request, Response } from "express";

import { ApiError } from "../../core/http/ApiError.js";
import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import type { AnalyticsService } from "./analytics.service.js";
import type { RevenueGranularity } from "./analytics.types.js";

function parseRange(q: { from: string; to: string }): { from: Date; to: Date } {
  const from = new Date(q.from);
  const to = new Date(q.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw ApiError.badRequest("Invalid date range");
  }
  if (from > to) {
    throw ApiError.badRequest("from must be before to");
  }
  return { from, to };
}

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  overview = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const q = req.query as { from?: string; to?: string };
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const data = await this.service.overview(rid, from, to);
    sendSuccess(res, data, { message: "OK" });
  });

  dashboard = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.dashboard(rid);
    sendSuccess(res, data, { message: "Dashboard" });
  });

  revenue = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const q = req.query as unknown as { from: string; to: string; granularity: RevenueGranularity };
    const { from, to } = parseRange(q);
    const data = await this.service.revenue(rid, from, to, q.granularity ?? "day");
    sendSuccess(res, data, { message: "Revenue series" });
  });

  topItems = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const q = req.query as unknown as { from: string; to: string; limit?: number };
    const { from, to } = parseRange(q);
    const limit = q.limit ?? 10;
    const data = await this.service.topItems(rid, from, to, limit);
    sendSuccess(res, data, { message: "Top items" });
  });

  payments = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const q = req.query as unknown as { from: string; to: string };
    const { from, to } = parseRange(q);
    const data = await this.service.payments(rid, from, to);
    sendSuccess(res, data, { message: "Payments" });
  });

  tables = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const q = req.query as unknown as { from: string; to: string };
    const { from, to } = parseRange(q);
    const data = await this.service.tables(rid, from, to);
    sendSuccess(res, data, { message: "Tables" });
  });

  peakHours = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const q = req.query as unknown as { from: string; to: string };
    const { from, to } = parseRange(q);
    const data = await this.service.peakHours(rid, from, to);
    sendSuccess(res, data, { message: "Peak hours" });
  });
}
