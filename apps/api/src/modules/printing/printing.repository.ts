import {
  repairLegacyKitchenPrinters,
  type KitchenStation,
  type PrintJobKind,
  type PrintJobStatus,
  type PrinterRole,
  type Prisma,
} from "@pos/database";

type RestaurantPrinter = Prisma.RestaurantPrinterGetPayload<Record<string, never>>;

import { prisma } from "../../prisma/index.js";

/** Defaults used only when creating a missing kitchen printer (first install). */
const DEFAULT_KITCHEN_PRINTER_BY_STATION: Record<
  KitchenStation,
  { name: string; connectionJson: { host: string; port: number } }
> = {
  PIZZA: { name: "Pizza Printer", connectionJson: { host: "192.168.0.100", port: 9100 } },
  PLATS: { name: "Plats Printer", connectionJson: { host: "192.168.0.101", port: 9100 } },
  SNACK: { name: "Snack Printer", connectionJson: { host: "192.168.0.102", port: 9100 } },
  CAFETERIA: { name: "Cafeteria Printer", connectionJson: { host: "192.168.0.103", port: 9100 } },
};

export class PrintingRepository {
  async createPrinter(input: {
    restaurantId: string;
    name: string;
    role: PrinterRole;
    kitchenStation?: KitchenStation | null;
    driver: string;
    connectionJson: object;
    paperWidthChars: number;
    isDefault: boolean;
    isActive: boolean;
  }) {
    if (input.isDefault) {
      await prisma.restaurantPrinter.updateMany({
        where: { restaurantId: input.restaurantId, role: input.role, isDefault: true },
        data: { isDefault: false },
      });
    }
    return prisma.restaurantPrinter.create({
      data: {
        restaurantId: input.restaurantId,
        name: input.name,
        role: input.role,
        kitchenStation: input.kitchenStation ?? null,
        driver: input.driver,
        connectionJson: input.connectionJson,
        paperWidthChars: input.paperWidthChars,
        isDefault: input.isDefault,
        isActive: input.isActive,
      },
    });
  }

  private async ensureDefaultPrinters(restaurantId: string): Promise<void> {
    await repairLegacyKitchenPrinters(prisma, restaurantId);

    const count = await prisma.restaurantPrinter.count({
      where: { restaurantId },
    });
    if (count === 0) {
      await prisma.restaurantPrinter
        .create({
          data: {
            restaurantId,
            name: "Cashier Printer",
            role: "CASHIER",
            driver: "RAW_ESCPOS",
            connectionJson: { transport: "usb", devicePath: "/dev/usb/lp0" },
            isDefault: true,
            isActive: true,
          },
        })
        .catch(() => undefined);
    }
  }

  async listPrinters(restaurantId: string) {
    await this.ensureDefaultPrinters(restaurantId);
    return prisma.restaurantPrinter.findMany({
      where: { restaurantId },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
  }

  async findPrinter(restaurantId: string, printerId: string) {
    return prisma.restaurantPrinter.findFirst({
      where: { id: printerId, restaurantId },
    });
  }

  async createJob(input: {
    restaurantId: string;
    printerId: string | null;
    requestedByUserId: string | null;
    kind: PrintJobKind;
    payloadJson: object;
    escposSha256: string;
    escposBytesBase64: string;
    priority: number;
    maxAttempts: number;
  }) {
    return prisma.printJob.create({
      data: {
        restaurantId: input.restaurantId,
        printerId: input.printerId,
        requestedByUserId: input.requestedByUserId,
        kind: input.kind,
        status: "PENDING",
        payloadJson: input.payloadJson,
        escposSha256: input.escposSha256,
        escposBytesBase64: input.escposBytesBase64,
        priority: input.priority,
        maxAttempts: input.maxAttempts,
      },
      include: { printer: true },
    });
  }

  async listJobs(restaurantId: string, filter: { status?: PrintJobStatus; limit: number; offset: number }) {
    return prisma.printJob.findMany({
      where: {
        restaurantId,
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: filter.limit,
      skip: filter.offset,
      include: { printer: { select: { id: true, name: true, role: true } } },
    });
  }

  async getJob(restaurantId: string, jobId: string) {
    return prisma.printJob.findFirst({
      where: { id: jobId, restaurantId },
      include: { printer: true },
    });
  }

  async claimNextJob(input: { restaurantId: string; printerId?: string | null; workerId: string }) {
    return prisma.$transaction(async (tx) => {
      const job = await tx.printJob.findFirst({
        where: {
          restaurantId: input.restaurantId,
          status: "PENDING",
          ...(input.printerId
            ? { OR: [{ printerId: null }, { printerId: input.printerId }] }
            : {}),
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      });
      if (!job) return null;
      const updated = await tx.printJob.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: {
          status: "PROCESSING",
          lockedAt: new Date(),
          lockedBy: input.workerId,
          attempts: { increment: 1 },
        },
      });
      if (updated.count === 0) return null;
      return tx.printJob.findUnique({
        where: { id: job.id },
        include: { printer: true },
      });
    });
  }

  async completeJob(restaurantId: string, jobId: string) {
    return prisma.printJob.updateMany({
      where: { id: jobId, restaurantId, status: "PROCESSING" },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  }

  async failJob(restaurantId: string, jobId: string, error: string, retry: boolean) {
    const job = await prisma.printJob.findFirst({
      where: { id: jobId, restaurantId },
    });
    if (!job) {
      return { ok: false as const };
    }
    if (job.status !== "PROCESSING") {
      return { ok: false as const };
    }
    const terminal = !retry || job.attempts >= job.maxAttempts;
    await prisma.printJob.update({
      where: { id: jobId },
      data: terminal
        ? {
            status: "FAILED",
            lastError: error,
            lockedAt: null,
            lockedBy: null,
          }
        : {
            status: "PENDING",
            lastError: error,
            lockedAt: null,
            lockedBy: null,
          },
    });
    return { ok: true as const, terminal };
  }

  async cancelJob(restaurantId: string, jobId: string) {
    return prisma.printJob.updateMany({
      where: { id: jobId, restaurantId, status: { in: ["PENDING", "PROCESSING"] } },
      data: {
        status: "CANCELLED",
        lockedAt: null,
        lockedBy: null,
      },
    });
  }

  async findRestaurantDisplayName(restaurantId: string): Promise<string> {
    const s = await prisma.systemSettings.findUnique({
      where: { restaurantId },
      select: { restaurantName: true },
    });
    if (s?.restaurantName?.trim()) return s.restaurantName.trim();
    const r = await prisma.restaurant.findFirst({
      where: { id: restaurantId },
      select: { name: true },
    });
    return r?.name ?? "Restaurant";
  }

  async findDefaultActivePrinterByRole(restaurantId: string, role: PrinterRole) {
    await this.ensureDefaultPrinters(restaurantId);
    return (
      (await prisma.restaurantPrinter.findFirst({
        where: { restaurantId, role, isActive: true, isDefault: true },
      })) ??
      (await prisma.restaurantPrinter.findFirst({
        where: { restaurantId, role, isActive: true },
        orderBy: { name: "asc" },
      }))
    );
  }

  /** Receipt station: dedicated receipt printer, else shared cashier printer. */
  async findDefaultActivePrinterForReceipt(restaurantId: string) {
    return (
      (await this.findDefaultActivePrinterByRole(restaurantId, "RECEIPT")) ??
      (await this.findDefaultActivePrinterByRole(restaurantId, "CASHIER"))
    );
  }

  async findActiveKitchenPrinter(restaurantId: string, station: KitchenStation) {
    return (
      (await prisma.restaurantPrinter.findFirst({
        where: { restaurantId, kitchenStation: station, isActive: true, role: "KITCHEN" },
        orderBy: { name: "asc" },
      })) ??
      (await prisma.restaurantPrinter.findFirst({
        where: {
          restaurantId,
          isActive: true,
          role: "KITCHEN",
          name: DEFAULT_KITCHEN_PRINTER_BY_STATION[station].name,
        },
      }))
    );
  }

  /** Resolve kitchen printer from DB; create with seed defaults only when none exists. */
  async ensureKitchenPrinter(restaurantId: string, station: KitchenStation): Promise<RestaurantPrinter> {
    const existing = await this.findActiveKitchenPrinter(restaurantId, station);
    if (existing) {
      return existing;
    }

    const defaults = DEFAULT_KITCHEN_PRINTER_BY_STATION[station];
    return prisma.restaurantPrinter.create({
      data: {
        restaurantId,
        name: defaults.name,
        role: "KITCHEN",
        kitchenStation: station,
        driver: "NETWORK_TCP",
        connectionJson: defaults.connectionJson,
        isActive: true,
        isDefault: false,
      },
    });
  }

  async updatePrinter(
    restaurantId: string,
    printerId: string,
    patch: {
      name?: string;
      role?: PrinterRole;
      kitchenStation?: KitchenStation | null;
      driver?: string;
      connectionJson?: object;
      paperWidthChars?: number;
      isDefault?: boolean;
      isActive?: boolean;
    },
  ) {
    const existing = await prisma.restaurantPrinter.findFirst({
      where: { id: printerId, restaurantId },
    });
    if (!existing) return null;
    const nextRole = patch.role ?? existing.role;
    if (patch.isDefault === true) {
      await prisma.restaurantPrinter.updateMany({
        where: { restaurantId, role: nextRole, isDefault: true, id: { not: printerId } },
        data: { isDefault: false },
      });
    }
    return prisma.restaurantPrinter.update({
      where: { id: printerId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.kitchenStation !== undefined ? { kitchenStation: patch.kitchenStation } : {}),
        ...(patch.driver !== undefined ? { driver: patch.driver } : {}),
        ...(patch.connectionJson !== undefined ? { connectionJson: patch.connectionJson } : {}),
        ...(patch.paperWidthChars !== undefined ? { paperWidthChars: patch.paperWidthChars } : {}),
        ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });
  }

  async deletePrinter(restaurantId: string, printerId: string) {
    const n = await prisma.restaurantPrinter.deleteMany({
      where: { id: printerId, restaurantId },
    });
    return n.count > 0;
  }
}
