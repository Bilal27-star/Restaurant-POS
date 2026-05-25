import { createHash } from "node:crypto";
import fs from "node:fs";

import type { KitchenStation, PrintJobKind, PrintJobStatus, PrinterRole, Prisma } from "@pos/database";

import { ApiError } from "../../core/http/ApiError.js";
import { prisma } from "../../prisma/index.js";
import { renderThermalEscPos } from "../../core/printing/renderer.js";
import type { ThermalDocument } from "../../core/printing/documents/types.js";
import { serializePrinter } from "./printer.dto.js";
import { printPayload } from "./printing.validation.js";
import { PrintingRepository } from "./printing.repository.js";

type RestaurantPrinter = Prisma.RestaurantPrinterGetPayload<Record<string, never>>;

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

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

  /**
   * Resolve kitchen printer: DB row by `kitchenStation` first, then legacy DB match, else seed defaults.
   */
  async resolveKitchenStationPrinter(
    restaurantId: string,
    station: KitchenStation,
  ): Promise<RestaurantPrinter> {
    const fromDb = await prisma.restaurantPrinter.findFirst({
      where: { restaurantId, kitchenStation: station, isActive: true },
      orderBy: { name: "asc" },
    });

    if (fromDb) {
      console.info("[PRINTER RESOLVED]", {
        restaurantId,
        station,
        printerId: fromDb.id,
        printerName: fromDb.name,
        connection: fromDb.connectionJson,
        source: "database",
      });
      return fromDb;
    }

    const legacy = await this.repo.findActiveKitchenPrinter(restaurantId, station);
    if (legacy) {
      console.info("[PRINTER RESOLVED]", {
        restaurantId,
        station,
        printerId: legacy.id,
        printerName: legacy.name,
        connection: legacy.connectionJson,
        source: "database_legacy",
      });
      return legacy;
    }

    console.info("[FALLBACK USED]", { restaurantId, station });
    return this.repo.ensureKitchenPrinter(restaurantId, station);
  }

  private parsePayload(kind: PrintJobKind, payload: unknown): ThermalDocument {
    const doc = printPayload.parse(payload);
    if (doc.kind !== kind) {
      throw ApiError.badRequest("payload.kind must match job kind");
    }
    return doc as ThermalDocument;
  }

  async enqueueKitchenStationJob(input: {
    restaurantId: string;
    requestedByUserId: string | null;
    station: KitchenStation;
    payload: unknown;
    itemNames: string[];
    orderId?: string;
    priority?: number;
  }) {
    console.log("[ORDER PRINT START]", {
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      station: input.station,
      items: input.itemNames,
      kind: "KITCHEN_TICKET",
    });

    try {
      const selectedPrinter = await this.resolveKitchenStationPrinter(
        input.restaurantId,
        input.station,
      );

      const job = await this.enqueueJob({
        restaurantId: input.restaurantId,
        requestedByUserId: input.requestedByUserId,
        kind: "KITCHEN_TICKET",
        payload: input.payload,
        printerId: selectedPrinter.id,
        priority: input.priority ?? 5,
      });

      console.log("[ORDER PRINT SUCCESS]", {
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        station: input.station,
        jobId: (job as { id?: string }).id,
      });

      return job;
    } catch (err) {
      console.error("[ORDER PRINT FAILED]", {
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        station: input.station,
        err,
      });
      throw err;
    }
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
    const connectionJson: Record<string, unknown> = {
      transport,
      ...connection,
    };

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
      const devicePath =
        (typeof connectionJson.devicePath === "string" ? connectionJson.devicePath : null) || "/dev/usb/lp0";
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
    kitchenStation?: KitchenStation | null;
    driver: string;
    connectionJson: object;
    paperWidthChars: number;
    isDefault: boolean;
    isActive: boolean;
  }) {
    try {
      const p = await this.repo.createPrinter({
        restaurantId,
        name: body.name,
        role: body.role,
        kitchenStation: body.role === "KITCHEN" ? (body.kitchenStation ?? null) : null,
        driver: body.driver,
        connectionJson: body.connectionJson,
        paperWidthChars: body.paperWidthChars,
        isDefault: body.isDefault,
        isActive: body.isActive,
      });
      return serializePrinter(p);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw ApiError.conflict("A printer already exists for this role and kitchen station");
      }
      throw err;
    }
  }

  async listPrinters(restaurantId: string) {
    const rows = await this.repo.listPrinters(restaurantId);
    return rows.map(serializePrinter);
  }

  async updatePrinter(
    restaurantId: string,
    printerId: string,
    body: Partial<{
      name: string;
      role: PrinterRole;
      kitchenStation: KitchenStation | null;
      driver: string;
      connectionJson: object;
      paperWidthChars: number;
      isDefault: boolean;
      isActive: boolean;
    }>,
  ) {
    const existing = await this.repo.findPrinter(restaurantId, printerId);
    if (!existing) {
      throw ApiError.notFound("Printer not found");
    }
    const nextRole = body.role ?? existing.role;
    const patch = {
      ...body,
      ...(body.kitchenStation !== undefined || body.role !== undefined
        ? { kitchenStation: nextRole === "KITCHEN" ? (body.kitchenStation ?? existing.kitchenStation ?? null) : null }
        : {}),
    };
    try {
      const p = await this.repo.updatePrinter(restaurantId, printerId, patch);
      if (!p) {
        throw ApiError.notFound("Printer not found");
      }
      return serializePrinter(p);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw ApiError.conflict("A printer already exists for this role and kitchen station");
      }
      throw err;
    }
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
