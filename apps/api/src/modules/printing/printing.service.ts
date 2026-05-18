import { createHash } from "node:crypto";
import fs from "node:fs";

import type { KitchenStation, PrintJobKind, PrintJobStatus, PrinterRole, RestaurantPrinter } from "@pos/database";

import { ApiError } from "../../core/http/ApiError.js";
import { renderThermalEscPos } from "../../core/printing/renderer.js";
import type { ThermalDocument } from "../../core/printing/documents/types.js";
import { prisma } from "../../prisma/index.js";
import { printPayload } from "./printing.validation.js";
import { PrintingRepository } from "./printing.repository.js";

const KITCHEN_STATION_CONFIG: Record<
  KitchenStation,
  { name: string; host: string; port: number }
> = {
  PIZZA: { name: "Pizza Printer", host: "192.168.1.100", port: 9100 },
  PLATS: { name: "Plats Printer", host: "192.168.1.101", port: 9100 },
  SNACK: { name: "Snack Printer", host: "192.168.1.102", port: 9100 },
  CAFETERIA: { name: "Cafeteria Printer", host: "192.168.1.103", port: 9100 },
};

function escposFingerprint(bytes: Uint8Array): { sha256: string; base64: string } {
  const buf = Buffer.from(bytes);
  return {
    sha256: createHash("sha256").update(buf).digest("hex"),
    base64: buf.toString("base64"),
  };
}

export class PrinterManager {
  constructor(private readonly repo: PrintingRepository) {}

  async paperWidthChars(restaurantId: string, printerId?: string | null): Promise<number> {
    if (printerId) {
      const p = await this.repo.findPrinter(restaurantId, printerId);
      if (p) return p.paperWidthChars;
    }
    const list = await this.repo.listPrinters(restaurantId);
    const def = list.find((x) => x.isDefault);
    return def?.paperWidthChars ?? list[0]?.paperWidthChars ?? 32;
  }
}

export class PrintingService {
  private readonly manager: PrinterManager;

  constructor(private readonly repo: PrintingRepository) {
    this.manager = new PrinterManager(repo);
  }

  private parsePayload(kind: PrintJobKind, payload: unknown): ThermalDocument {
    const doc = printPayload.parse(payload);
    if (doc.kind !== kind) {
      throw ApiError.badRequest("payload.kind must match job kind");
    }
    return doc as ThermalDocument;
  }

  private async resolveKitchenStationPrinter(
    restaurantId: string,
    station: KitchenStation,
  ): Promise<RestaurantPrinter> {
    const cfg = KITCHEN_STATION_CONFIG[station];
    if (!cfg) {
      throw new Error(`Unknown kitchen station: ${station}`);
    }

    const connectionJson = { host: cfg.host, port: cfg.port };
    const printerData = {
      name: cfg.name,
      role: "KITCHEN" as const,
      kitchenStation: station,
      driver: "NETWORK_TCP" as const,
      connectionJson,
      isActive: true,
      isDefault: false,
    };

    const existingPrinter =
      (await prisma.restaurantPrinter.findFirst({
        where: { restaurantId, kitchenStation: station, isActive: true },
      })) ??
      (await prisma.restaurantPrinter.findFirst({
        where: { restaurantId, name: cfg.name, isActive: true },
      }));

    if (existingPrinter) {
      return prisma.restaurantPrinter.update({
        where: { id: existingPrinter.id },
        data: printerData,
      });
    }

    return prisma.restaurantPrinter.create({
      data: { restaurantId, ...printerData },
    });
  }

  async enqueueKitchenStationJob(input: {
    restaurantId: string;
    requestedByUserId: string | null;
    station: KitchenStation;
    payload: unknown;
    itemNames: string[];
    priority?: number;
  }) {
    console.log("KITCHEN JOB CREATED", {
      station: input.station,
      items: input.itemNames,
    });

    const selectedPrinter = await this.resolveKitchenStationPrinter(input.restaurantId, input.station);

    console.log("PRINTER RESOLUTION", {
      kind: "KITCHEN_TICKET",
      station: input.station,
      printer: selectedPrinter.name,
      connection: selectedPrinter.connectionJson,
    });

    return this.enqueueJob({
      restaurantId: input.restaurantId,
      requestedByUserId: input.requestedByUserId,
      kind: "KITCHEN_TICKET",
      payload: input.payload,
      printerId: selectedPrinter.id,
      priority: input.priority ?? 5,
    });
  }

  async renderEscPos(input: {
    restaurantId: string;
    kind: PrintJobKind;
    payload: unknown;
    printerId?: string | null;
  }): Promise<{ escposBase64: string; sha256: string; widthChars: number }> {
    const doc = this.parsePayload(input.kind, input.payload);
    const width = await this.manager.paperWidthChars(input.restaurantId, input.printerId ?? null);
    const bytes = renderThermalEscPos(input.kind, doc, width);
    const { sha256, base64 } = escposFingerprint(bytes);
    return { escposBase64: base64, sha256, widthChars: width };
  }

  async enqueueJob(input: {
    restaurantId: string;
    requestedByUserId: string | null;
    kind: PrintJobKind;
    payload: unknown;
    printerId: string;
    priority?: number;
    maxAttempts?: number;
  }) {
    const doc = this.parsePayload(input.kind, input.payload);

    if (!input.printerId) {
      throw ApiError.badRequest("printerId is required");
    }

    const selectedPrinter = await this.repo.findPrinter(input.restaurantId, input.printerId);
    if (!selectedPrinter) {
      throw ApiError.badRequest("Resolved printer not found");
    }

    console.log("ENQUEUE RECEIVED PRINTER", selectedPrinter.name);

    const width =
      selectedPrinter.paperWidthChars ??
      (await this.manager.paperWidthChars(input.restaurantId, selectedPrinter.id));
    const bytes = renderThermalEscPos(input.kind, doc, width);
    const { sha256, base64 } = escposFingerprint(bytes);

    const job = await this.repo.createJob({
      restaurantId: input.restaurantId,
      printerId: selectedPrinter.id,
      requestedByUserId: input.requestedByUserId,
      kind: input.kind,
      payloadJson: doc as unknown as object,
      escposSha256: sha256,
      escposBytesBase64: base64,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 5,
    });

    const connection = (selectedPrinter.connectionJson as Record<string, unknown>) || {};
    const transport =
      (connection.transport as string | undefined) ||
      (selectedPrinter.driver === "NETWORK_TCP" ? "tcp" : "usb");
    const driver = selectedPrinter.driver || "RAW_ESCPOS";
    const connectionJson = {
      transport,
      ...connection,
    };

    console.log("PRINT EXECUTION", {
      printer: selectedPrinter.name,
    });

    // Support validation for Ethernet printers
    if (transport === "tcp" || transport === "ethernet") {
      const ip = connectionJson.ip || connectionJson.host;
      const port = connectionJson.port;
      if (!ip || typeof ip !== "string") {
        throw new Error("Ethernet printer validation failed: ip must be a string");
      }
      if (typeof port !== "number" || port <= 0 || port > 65535) {
        throw new Error("Ethernet printer validation failed: port must be a valid number");
      }
    }

    // Skip actual USB device execution if device does not exist
    if (transport === "usb") {
      const devicePath = connectionJson.devicePath || "/dev/usb/lp0";
      if (fs.existsSync(devicePath)) {
        try {
          fs.writeFileSync(devicePath, Buffer.from(base64, "base64"));
        } catch (err) {
          console.error("USB printer write error:", err);
        }
      } else {
        console.log(`USB device ${devicePath} does not exist. Skipping physical device execution.`);
      }
    }

    return this.serializeJob(job, true);
  }

  async listJobs(restaurantId: string, q: { status?: string; limit: number; offset: number }) {
    const rows = await this.repo.listJobs(restaurantId, {
      status: q.status as PrintJobStatus | undefined,
      limit: q.limit,
      offset: q.offset,
    });
    return rows.map((j) => this.serializeJob(j, false));
  }

  async getJob(restaurantId: string, jobId: string) {
    const j = await this.repo.getJob(restaurantId, jobId);
    if (!j) {
      throw ApiError.notFound("Print job not found");
    }
    return this.serializeJob(j, true);
  }

  async dequeue(restaurantId: string, body: { printerId?: string | null; workerId: string }) {
    const j = await this.repo.claimNextJob({
      restaurantId,
      printerId: body.printerId,
      workerId: body.workerId,
    });
    if (!j) {
      return { job: null as null };
    }
    return { job: this.serializeJob(j, true) };
  }

  async completeJob(restaurantId: string, jobId: string) {
    const n = await this.repo.completeJob(restaurantId, jobId);
    if (n.count === 0) {
      throw ApiError.conflict("Job is not in PROCESSING state");
    }
    return this.getJob(restaurantId, jobId);
  }

  async failJob(restaurantId: string, jobId: string, error: string, retry: boolean) {
    const res = await this.repo.failJob(restaurantId, jobId, error, retry);
    if (!res.ok) {
      throw ApiError.notFound("Print job not found");
    }
    return { job: await this.getJob(restaurantId, jobId), terminal: res.terminal };
  }

  async cancelJob(restaurantId: string, jobId: string) {
    const n = await this.repo.cancelJob(restaurantId, jobId);
    if (n.count === 0) {
      throw ApiError.conflict("Job cannot be cancelled");
    }
    return this.getJob(restaurantId, jobId);
  }

  async createPrinter(restaurantId: string, body: {
    name: string;
    role: PrinterRole;
    driver: string;
    connectionJson: object;
    paperWidthChars: number;
    isDefault: boolean;
    isActive: boolean;
  }) {
    const p = await this.repo.createPrinter({
      restaurantId,
      name: body.name,
      role: body.role,
      driver: body.driver,
      connectionJson: body.connectionJson,
      paperWidthChars: body.paperWidthChars,
      isDefault: body.isDefault,
      isActive: body.isActive,
    });
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      driver: p.driver,
      connectionJson: p.connectionJson,
      paperWidthChars: p.paperWidthChars,
      isDefault: p.isDefault,
      isActive: p.isActive,
    };
  }

  async listPrinters(restaurantId: string) {
    const rows = await this.repo.listPrinters(restaurantId);
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      driver: p.driver,
      connectionJson: p.connectionJson,
      paperWidthChars: p.paperWidthChars,
      isDefault: p.isDefault,
      isActive: p.isActive,
    }));
  }

  async updatePrinter(
    restaurantId: string,
    printerId: string,
    body: Partial<{
      name: string;
      role: PrinterRole;
      driver: string;
      connectionJson: object;
      paperWidthChars: number;
      isDefault: boolean;
      isActive: boolean;
    }>,
  ) {
    const p = await this.repo.updatePrinter(restaurantId, printerId, body);
    if (!p) {
      throw ApiError.notFound("Printer not found");
    }
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      driver: p.driver,
      connectionJson: p.connectionJson,
      paperWidthChars: p.paperWidthChars,
      isDefault: p.isDefault,
      isActive: p.isActive,
    };
  }

  async deletePrinter(restaurantId: string, printerId: string) {
    const ok = await this.repo.deletePrinter(restaurantId, printerId);
    if (!ok) {
      throw ApiError.notFound("Printer not found");
    }
    return { ok: true as const };
  }

  /**
   * Placeholder discovery: returns suggested `connectionJson` shapes for local agents (USB path, TCP host:port).
   * OS-specific USB enumeration belongs in the Tauri/desktop worker, not the API.
   */
  discoverPrinterTemplates() {
    return {
      templates: [
        {
          id: "raw_escpos_tcp",
          label: "Network thermal (RAW ESC/POS over TCP)",
          driver: "RAW_ESCPOS",
          connectionJson: { transport: "tcp", host: "192.168.1.50", port: 9100 },
        },
        {
          id: "raw_escpos_usb_path",
          label: "USB thermal (path / spool — filled by desktop agent)",
          driver: "RAW_ESCPOS",
          connectionJson: { transport: "usb", devicePath: "/dev/usb/lp0" },
        },
        {
          id: "spool_file",
          label: "Spool to file (diagnostics)",
          driver: "SPOOL_FILE",
          connectionJson: { transport: "file", path: "/tmp/pos-receipt.bin" },
        },
      ],
    };
  }

  private serializeJob(
    j: Record<string, unknown> & {
      printer?: {
        id: string;
        name: string;
        role: string;
        connectionJson?: unknown;
        paperWidthChars?: number;
      } | null;
    },
    includePayload: boolean,
  ): unknown {
    return {
      id: j.id,
      restaurantId: j.restaurantId,
      printerId: j.printerId,
      printer: j.printer
        ? includePayload
          ? {
              id: j.printer.id,
              name: j.printer.name,
              role: j.printer.role,
              connectionJson: j.printer.connectionJson ?? {},
              paperWidthChars: j.printer.paperWidthChars ?? 32,
            }
          : { id: j.printer.id, name: j.printer.name, role: j.printer.role }
        : null,
      kind: j.kind,
      status: j.status,
      priority: j.priority,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      lastError: j.lastError,
      lockedAt: j.lockedAt,
      lockedBy: j.lockedBy,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      completedAt: j.completedAt,
      escposSha256: j.escposSha256,
      escposBytesBase64: includePayload ? j.escposBytesBase64 : undefined,
      payloadJson: includePayload ? j.payloadJson : undefined,
    };
  }
}
