import { registerPosPrintBridge, clearPosPrintBridge } from "@/lib/print/print-bridge";

/** True when the bundle was built by the Tauri CLI (embedded desktop shell). */
export function isTauriDesktop(): boolean {
  return Boolean(import.meta.env.TAURI_ENV_PLATFORM || import.meta.env.TAURI_ENV_FAMILY);
}

/**
 * Wires `print_escpos_base64` and related IPC for local thermal printers.
 * Call once from the authenticated shell; no-op return if not running in Tauri.
 */
export async function installTauriDesktopHost(): Promise<() => void> {
  if (!isTauriDesktop()) {
    return () => undefined;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  registerPosPrintBridge({
    sendEscPosBase64: async (escposBase64, meta) => {
      await invoke("print_escpos_base64", {
        escposBase64,
        metaJson: meta != null ? JSON.stringify(meta) : null,
      });
    },
  });
  return () => {
    clearPosPrintBridge();
  };
}

export async function invokeDesktopPaths(): Promise<Record<string, string>> {
  if (!isTauriDesktop()) {
    throw new Error("Not running in Tauri");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Record<string, string>>("pos_desktop_paths");
}
