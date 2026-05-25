import { repairLegacyPrinters } from "./printing.repair.js";

repairLegacyPrinters().catch((err) => {
  console.error("[printing.repair] failed", err);
});

export { createPrinterRouter } from "./printer.routes.js";
export { createPrintingRouter } from "./printing.routes.js";
export { PrintingService, PrinterManager } from "./printing.service.js";
export { PrintingRepository } from "./printing.repository.js";
export { HardwarePrintOrchestrator } from "./hardware-print-orchestrator.js";
