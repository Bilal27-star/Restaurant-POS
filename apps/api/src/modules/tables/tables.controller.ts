import type { Request, Response } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import type { TablesService } from "./tables.service.js";

export class TablesController {
  constructor(private readonly service: TablesService) {}

  layout = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.layout(rid);
    sendSuccess(res, data, { message: "OK" });
  });

  listTables = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.listTables(rid);
    sendSuccess(res, data, { message: "OK" });
  });

  getTableById = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { tableId } = req.params as { tableId: string };
    const data = await this.service.getTableById(rid, tableId);
    sendSuccess(res, data, { message: "OK" });
  });

  createFloor = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const body = req.body as { name: string; sortOrder?: number };
    const data = await this.service.createFloor(rid, body.name, body.sortOrder ?? 0);
    sendSuccess(res, data, { message: "Floor created", status: 201 });
  });

  patchFloor = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { floorId } = req.params as { floorId: string };
    const body = req.body as { name?: string; sortOrder?: number };
    const data = await this.service.updateFloor(rid, floorId, body);
    sendSuccess(res, data, { message: "Floor updated" });
  });

  deleteFloor = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { floorId } = req.params as { floorId: string };
    const data = await this.service.deleteFloor(rid, floorId);
    sendSuccess(res, data, { message: "Floor deleted" });
  });

  createTable = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const body = req.body as { floorId?: string | null; number: string; capacity: number };
    const data = await this.service.createTable(rid, {
      floorId: body.floorId ?? null,
      number: body.number,
      capacity: body.capacity,
    });
    sendSuccess(res, data, { message: "Table created", status: 201 });
  });

  patchTable = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { tableId } = req.params as { tableId: string };
    const body = req.body as {
      number?: string;
      capacity?: number;
      floorId?: string | null;
      status?: import("@prisma/client").TableStatus;
    };
    const data = await this.service.updateTable(rid, tableId, body);
    sendSuccess(res, data, { message: "Table updated" });
  });

  deleteTable = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { tableId } = req.params as { tableId: string };
    const data = await this.service.deleteTable(rid, tableId);
    sendSuccess(res, data, { message: "Table deleted" });
  });
}
