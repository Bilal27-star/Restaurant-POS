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

function connectionDevicePath(connectionJson: unknown): string | null {
  if (!connectionJson || typeof connectionJson !== "object") return null;
  const devicePath = (connectionJson as Record<string, unknown>).devicePath;
  return typeof devicePath === "string" ? devicePath : null;
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
