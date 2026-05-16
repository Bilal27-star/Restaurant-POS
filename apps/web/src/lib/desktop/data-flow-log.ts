import { isTauriDesktop } from "@/lib/desktop/tauri-host";
import { resolvedApiOrigin } from "@/lib/app-api";

function enabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (isTauriDesktop()) return true;
  try {
    return localStorage.getItem("POS_DATA_FLOW_LOG") === "1";
  } catch {
    return false;
  }
}

export function logDataFlow(event: string, detail?: Record<string, unknown>): void {
  if (!enabled()) return;
  const payload = {
    event,
    apiOrigin: resolvedApiOrigin(),
    tauri: isTauriDesktop(),
    ...detail,
  };
  console.info("[pos-data-flow]", payload);
}
