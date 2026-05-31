import type { PrismaClient } from "@prisma/client";

const PROTECTED_PRINTER_NAMES = new Set([
  "Pizza Printer",
  "Plats Printer",
  "Snack Printer",
  "Cafeteria Printer",
  "Cashier Printer",
]);

const LEGACY_KITCHEN_PRINTER_NAME = "Kitchen Printer";

export type PrinterRepairRow = {
  id: string;
  restaurantId: string;
  name: string;
  role: string;
  driver: string;
  connectionJson: unknown;
};

function connectionTransport(connectionJson: unknown): string | null {
  if (!connectionJson || typeof connectionJson !== "object") return null;
  const transport = (connectionJson as Record<string, unknown>).transport;
  return typeof transport === "string" ? transport : null;
}

function connectionDevicePath(connectionJson: unknown): string | null {
  if (!connectionJson || typeof connectionJson !== "object") return null;
  const devicePath = (connectionJson as Record<string, unknown>).devicePath;
  return typeof devicePath === "string" ? devicePath : null;
}

/** Linux-only USB paths stored before Windows spooler support. */
export function isLegacyLinuxUsbCashierPrinter(
  row: Pick<PrinterRepairRow, "role" | "connectionJson">,
): boolean {
  if (row.role !== "CASHIER" && row.role !== "RECEIPT") return false;
  const transport = connectionTransport(row.connectionJson);
  if (transport !== "usb") return false;
  const devicePath = connectionDevicePath(row.connectionJson);
  if (!devicePath) return true;
  return devicePath.includes("/dev/usb/") || devicePath === "/dev/usb/lp0";
}

/** Legacy USB kitchen printer created before station-based NETWORK_TCP routing. */
export function isLegacyKitchenPrinter(row: Pick<PrinterRepairRow, "name" | "role" | "driver" | "connectionJson">): boolean {
  if (PROTECTED_PRINTER_NAMES.has(row.name)) return false;
  if (row.driver === "NETWORK_TCP") return false;
  if (row.name !== LEGACY_KITCHEN_PRINTER_NAME) return false;
  if (row.role !== "KITCHEN") return false;
  if (row.driver !== "RAW_ESCPOS") return false;
  const devicePath = connectionDevicePath(row.connectionJson);
  if (!devicePath?.includes("/dev/usb/")) return false;
  return true;
}

/**
 * Deletes legacy "Kitchen Printer" USB rows only. Idempotent and safe to run on startup/seed.
 */
export async function repairLegacyKitchenPrinters(
  prisma: PrismaClient,
  restaurantId?: string,
): Promise<number> {
  const rows = await prisma.restaurantPrinter.findMany({
    where: restaurantId ? { restaurantId } : undefined,
    select: {
      id: true,
      restaurantId: true,
      name: true,
      role: true,
      driver: true,
      connectionJson: true,
    },
  });

  let removed = 0;
  for (const row of rows) {
    if (!isLegacyKitchenPrinter(row)) continue;
    await prisma.restaurantPrinter.delete({ where: { id: row.id } });
    console.info("[LEGACY PRINTER REMOVED]", {
      restaurantId: row.restaurantId,
      printerId: row.id,
      name: row.name,
      driver: row.driver,
    });
    removed += 1;
  }

  return removed;
}

/**
 * Migrates cashier/receipt printers off Linux device paths to Windows-friendly winspool shape.
 * Idempotent: only updates rows still on legacy `/dev/usb/*` USB config.
 */
export async function repairLegacyCashierUsbPrinters(
  prisma: PrismaClient,
  restaurantId?: string,
): Promise<number> {
  const rows = await prisma.restaurantPrinter.findMany({
    where: restaurantId ? { restaurantId } : undefined,
    select: {
      id: true,
      restaurantId: true,
      name: true,
      role: true,
      driver: true,
      connectionJson: true,
    },
  });

  let migrated = 0;
  for (const row of rows) {
    if (!isLegacyLinuxUsbCashierPrinter(row)) continue;
    await prisma.restaurantPrinter.update({
      where: { id: row.id },
      data: {
        connectionJson: { transport: "winspool", printerName: "" },
      },
    });
    console.info("[CASHIER USB MIGRATED]", {
      restaurantId: row.restaurantId,
      printerId: row.id,
      name: row.name,
      role: row.role,
      note: "Reconfigure Windows queue name in Settings → Printers",
    });
    migrated += 1;
  }

  return migrated;
}
