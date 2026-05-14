/**
 * Thermal / receipt printing boundary. Implementations:
 * - Tauri: IPC to Rust → OS print spooler or raw USB.
 * - Browser: WebUSB / vendor extension (optional); may throw until configured.
 * Printing stays on this port so orders/payments stay usable offline while jobs queue locally.
 */
export type PrintJobMeta = {
  jobId: string;
  /** Correlates to outbox row or local order id for recovery logs. */
  correlationId?: string;
  /** e.g. "kitchen" | "customer" | "shift_summary" */
  channel?: string;
};

export interface ThermalPrinterPort {
  printRaw(bytes: Uint8Array, meta: PrintJobMeta): Promise<void>;
}

/** Default until a native bridge is injected (Tauri / Electron). */
export class UnconfiguredThermalPrinter implements ThermalPrinterPort {
  async printRaw(_bytes: Uint8Array, meta: PrintJobMeta): Promise<void> {
    throw new Error(
      `Thermal printer not configured (jobId=${meta.jobId}). Inject ThermalPrinterPort in desktop shell.`,
    );
  }
}
