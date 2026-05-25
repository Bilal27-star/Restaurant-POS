import { repairLegacyKitchenPrinters } from "@pos/database";

import { prisma } from "../../prisma/index.js";

/** Remove legacy USB "Kitchen Printer" rows across all restaurants (idempotent). */
export async function repairLegacyPrinters(): Promise<void> {
  const removed = await repairLegacyKitchenPrinters(prisma);
  if (removed > 0) {
    console.info("[printing.repair] legacy kitchen printers removed", { count: removed });
  }
}
