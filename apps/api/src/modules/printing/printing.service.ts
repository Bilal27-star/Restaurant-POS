import { createHash } from "node:crypto";

import type { PrintJobKind } from "@prisma/client";

import { ApiError } from "../../core/http/ApiError.js";
import { renderThermalEscPos } from "../../core/printing/renderer.js";
import type { ThermalDocument } from "../../core/printing/documents/types.js";
import { printPayload } from "./printing.validation.js";
import { PrintingRepository } from "./printing.repository.js";

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
    printerId?: string | null;
    priority?: number;
    maxAttempts?: number;
  }) {
    const doc = this.parsePayload(input.kind, input.payload);
    const width = await this.manager.paperWidthChars(input.restaurantId, input.printerId ?? null);
    const bytes = renderThermalEscPos(input.kind, doc, width);
    const { sha256, base64 } = escposFingerprint(bytes);
    const job = await this.repo.createJob({
      restaurantId: input.restaurantId,
      printerId: input.printerId ?? null,
      requestedByUserId: input.requestedByUserId,
      kind: input.kind,
      payloadJson: doc as unknown as object,
      escposSha256: sha256,
      escposBytesBase64: base64,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 5,
    });
    return this.serializeJob(job, true);
  }

  async listJobs(restaurantId: string, q: { status?: string; limit: number; offset: number }) {
    const rows = await this.repo.listJobs(restaurantId, {
      status: q.status as import("@prisma/client").PrintJobStatus | undefined,
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
    role: import("@prisma/client").PrinterRole;
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
      role: import("@prisma/client").PrinterRole;
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
