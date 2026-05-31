import { isTauriDesktop } from "./tauri-host";

export type LocalPrinterDiscovery = {
  comPorts: string[];
  spoolerPrinters: string[];
};

/** COM/serial paths and Windows spooler queue names (Tauri only). */
export async function discoverLocalPrinters(): Promise<LocalPrinterDiscovery> {
  if (!isTauriDesktop()) {
    return { comPorts: [], spoolerPrinters: [] };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const [comPorts, spoolerPrinters] = await Promise.all([
    invoke<string[]>("list_usb_printer_paths").catch(() => []),
    invoke<string[]>("list_windows_spooler_printers").catch(() => []),
  ]);
  return { comPorts, spoolerPrinters };
}
