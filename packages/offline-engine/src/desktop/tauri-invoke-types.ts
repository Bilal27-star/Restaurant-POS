/**
 * Typed IPC surface for a future Tauri shell (`invoke` / `listen`).
 * Rust side owns SQLite file, USB printer, and cash drawer GPIO.
 */
export type TauriInvokeCommand =
  | "offline:sqlite_exec"
  | "offline:sqlite_query"
  | "printer:escpos_raw"
  | "printer:list_devices"
  | "device:persist_path";

export type TauriPrinterInvokePayload = {
  bytes: number[];
  meta: { jobId: string; correlationId?: string; channel?: string };
};
