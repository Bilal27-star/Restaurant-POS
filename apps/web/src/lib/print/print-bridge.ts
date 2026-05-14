/**
 * Desktop / Tauri hook: register a handler to receive pre-rendered ESC/POS (base64)
 * from the web app and send it to USB/network drivers. The API already stores jobs;
 * the shell can also call `invoke("print_escpos_base64", ...)` when draining the queue.
 */
export type PosPrintBridge = {
  sendEscPosBase64(escposBase64: string, meta?: Record<string, unknown>): Promise<void>;
};

declare global {
  interface Window {
    __POS_PRINT_BRIDGE__?: PosPrintBridge;
  }
}

export function registerPosPrintBridge(bridge: PosPrintBridge): void {
  if (typeof window === "undefined") return;
  window.__POS_PRINT_BRIDGE__ = bridge;
}

export function clearPosPrintBridge(): void {
  if (typeof window === "undefined") return;
  delete window.__POS_PRINT_BRIDGE__;
}

export async function sendEscPosViaBridge(escposBase64: string, meta?: Record<string, unknown>): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const bridge = window.__POS_PRINT_BRIDGE__;
  if (!bridge) return false;
  await bridge.sendEscPosBase64(escposBase64, meta);
  return true;
}
