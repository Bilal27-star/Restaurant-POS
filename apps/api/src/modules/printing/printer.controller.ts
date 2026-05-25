import type { Request, Response } from "express";

import { asyncHandler } from "../../core/http/asyncHandler.js";
import { sendSuccess } from "../../core/http/response.js";
import { serializePrinter } from "./printer.dto.js";
import { PrinterDiscoveryService } from "./printer-discovery.service.js";
import { PrinterTestService } from "./printer-test.service.js";
import { PrintingRepository } from "./printing.repository.js";

export class PrinterController {
  constructor(
    private readonly discovery: PrinterDiscoveryService,
    private readonly printerTest: PrinterTestService,
    private readonly repo: PrintingRepository,
  ) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const rows = await this.repo.listPrinters(auth.restaurantId);
    const data = rows.map(serializePrinter);
    sendSuccess(res, data, { message: "Printers" });
  });

  discover = asyncHandler(async (req: Request, res: Response) => {
    void req;
    const data = await this.discovery.discoverPrinters();
    sendSuccess(res, data, { message: "Discovered printers" });
  });

  testConnection = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { host: string; port?: number };
    const data = await this.printerTest.testPrinterConnection(body);
    sendSuccess(res, data, { message: "Printer connection test" });
  });
}
