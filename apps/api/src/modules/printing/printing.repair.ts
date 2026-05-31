import { repairLegacyCashierUsbPrinters, repairLegacyKitchenPrinters } from "@pos/database";

import { prisma } from "../../prisma/index.js";

/** Remove legacy USB kitchen rows; migrate Linux USB cashier paths to winspool (idempotent). */
export async function repairLegacyPrinters(): Promise<void> {
  const removed = await repairLegacyKitchenPrinters(prisma);
  if (removed > 0) {
    console.info("[printing.repair] legacy kitchen printers removed", { count: removed });
  }
  const migrated = await repairLegacyCashierUsbPrinters(prisma);
  if (migrated > 0) {
    console.info("[printing.repair] legacy cashier USB migrated to winspool", { count: migrated });
  }
}
