import { startThermalPrintWorker, stopThermalPrintWorker, getThermalPrintWorker } from "./thermal-print-worker";
import { ReceiptPrinter } from "./receipt-printer";
import { KitchenPrinter } from "./kitchen-printer";

/**
 * Coordinates local thermal output: API-backed queue worker + direct test prints.
 */
export class PrinterManager {
  static startLocalWorker(): void {
    startThermalPrintWorker();
  }

  static stopLocalWorker(): void {
    stopThermalPrintWorker();
  }

  static isWorkerRunning(): boolean {
    return getThermalPrintWorker().isRunning();
  }

  static testReceipt(printerId: string): Promise<void> {
    return ReceiptPrinter.printTestPage(printerId);
  }

  static testKitchen(printerId: string): Promise<void> {
    return KitchenPrinter.printTestPage(printerId);
  }
}

export { THERMAL_WIDTH_58MM, THERMAL_WIDTH_80MM, buildPrintDispatchMeta } from "./esc-pos-formatter";
export { PrintQueue } from "./print-queue";
export { ReceiptPrinter } from "./receipt-printer";
export { KitchenPrinter } from "./kitchen-printer";
export { getThermalPrintWorker, startThermalPrintWorker, stopThermalPrintWorker } from "./thermal-print-worker";
