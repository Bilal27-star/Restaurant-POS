import type { Request, Response } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import type { PrintingService } from "./printing.service.js";

export class PrintingController {
  constructor(private readonly service: PrintingService) {}

  render = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const body = req.body as {
      kind: import("@prisma/client").PrintJobKind;
      printerId?: string | null;
      payload: unknown;
    };
    const data = await this.service.renderEscPos({
      restaurantId: auth.restaurantId,
      kind: body.kind,
      payload: body.payload,
      printerId: body.printerId,
    });
    sendSuccess(res, data, { message: "ESC/POS payload" });
  });

  enqueue = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const body = req.body as {
      kind: import("@prisma/client").PrintJobKind;
      printerId?: string | null;
      priority?: number;
      maxAttempts?: number;
      payload: unknown;
    };
    const data = await this.service.enqueueJob({
      restaurantId: auth.restaurantId,
      requestedByUserId: auth.userId,
      kind: body.kind,
      payload: body.payload,
      printerId: body.printerId,
      priority: body.priority,
      maxAttempts: body.maxAttempts,
    });
    sendSuccess(res, data, { message: "Print job enqueued", status: 201 });
  });

  listJobs = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const q = req.query as unknown as { status?: string; limit: number; offset: number };
    const data = await this.service.listJobs(auth.restaurantId, q);
    sendSuccess(res, data, { message: "Print jobs" });
  });

  getJob = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { jobId } = req.params as { jobId: string };
    const data = await this.service.getJob(auth.restaurantId, jobId);
    sendSuccess(res, data, { message: "Print job" });
  });

  claim = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const body = req.body as { printerId?: string | null; workerId: string };
    const data = await this.service.dequeue(auth.restaurantId, body);
    sendSuccess(res, data, { message: data.job ? "Job claimed" : "No pending jobs" });
  });

  completeJob = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { jobId } = req.params as { jobId: string };
    const data = await this.service.completeJob(auth.restaurantId, jobId);
    sendSuccess(res, data, { message: "Print job completed" });
  });

  failJob = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { jobId } = req.params as { jobId: string };
    const body = req.body as { error: string; retry?: boolean };
    const data = await this.service.failJob(auth.restaurantId, jobId, body.error, body.retry ?? true);
    sendSuccess(res, data, { message: "Print job failure recorded" });
  });

  cancelJob = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { jobId } = req.params as { jobId: string };
    const data = await this.service.cancelJob(auth.restaurantId, jobId);
    sendSuccess(res, data, { message: "Print job cancelled" });
  });

  listPrinters = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const data = await this.service.listPrinters(auth.restaurantId);
    sendSuccess(res, data, { message: "Printers" });
  });

  createPrinter = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const body = req.body as {
      name: string;
      role: import("@prisma/client").PrinterRole;
      kitchenStation?: import("@prisma/client").KitchenStation | null;
      driver?: string;
      connectionJson?: object;
      paperWidthChars?: number;
      isDefault?: boolean;
      isActive?: boolean;
    };
    const data = await this.service.createPrinter(auth.restaurantId, {
      name: body.name,
      role: body.role,
      kitchenStation: body.kitchenStation ?? null,
      driver: body.driver ?? "RAW_ESCPOS",
      connectionJson: body.connectionJson ?? {},
      paperWidthChars: body.paperWidthChars ?? 32,
      isDefault: body.isDefault ?? false,
      isActive: body.isActive ?? true,
    });
    sendSuccess(res, data, { message: "Printer registered", status: 201 });
  });

  updatePrinter = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { printerId } = req.params as { printerId: string };
    const body = req.body as {
      name?: string;
      role?: import("@prisma/client").PrinterRole;
      kitchenStation?: import("@prisma/client").KitchenStation | null;
      driver?: string;
      connectionJson?: object;
      paperWidthChars?: number;
      isDefault?: boolean;
      isActive?: boolean;
    };
    const data = await this.service.updatePrinter(auth.restaurantId, printerId, body);
    sendSuccess(res, data, { message: "Printer updated" });
  });

  deletePrinter = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { printerId } = req.params as { printerId: string };
    const data = await this.service.deletePrinter(auth.restaurantId, printerId);
    sendSuccess(res, data, { message: "Printer removed" });
  });

  discoverPrinters = asyncHandler(async (req: Request, res: Response) => {
    void req;
    const data = this.service.discoverPrinterTemplates();
    sendSuccess(res, data, { message: "Printer discovery templates" });
  });
}
