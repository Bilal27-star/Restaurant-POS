/**
 * Detect execution shell for desktop packaging (Tauri) vs browser PWA.
 * Used to choose persistence drivers (SQLite file vs IndexedDB) and printer IPC.
 */
export type HostRuntimeKind = "browser" | "tauri" | "electron" | "ssr" | "unknown";

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
    electron?: unknown;
  }
}

export function detectHostRuntime(): HostRuntimeKind {
  if (typeof window === "undefined") {
    return "ssr";
  }
  if (window.__TAURI_INTERNALS__ ?? window.__TAURI__) {
    return "tauri";
  }
  if (window.electron) {
    return "electron";
  }
  if (typeof navigator !== "undefined" && navigator.userAgent?.includes("Electron")) {
    return "electron";
  }
  return "browser";
}

/** True when native filesystem / SQLite sidecars are expected to exist (Tauri desktop). */
export function isDesktopShell(): boolean {
  const r = detectHostRuntime();
  return r === "tauri" || r === "electron";
}
