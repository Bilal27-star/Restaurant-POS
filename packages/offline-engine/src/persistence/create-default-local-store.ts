import { detectHostRuntime } from "../runtime/host-environment.js";
import { IndexedDbJsonStore } from "./indexeddb-json-store.js";
import type { LocalStoreDriver } from "./local-store-driver.js";
import { MemoryLocalStore } from "./memory-store.js";

/**
 * Browser → IndexedDB when available; SSR / tests → memory.
 * Desktop (Tauri) can replace this with a SQLite-backed driver wired in the shell.
 */
export function createDefaultLocalStore(): LocalStoreDriver {
  const rt = detectHostRuntime();
  if (rt === "browser" && typeof indexedDB !== "undefined") {
    return new IndexedDbJsonStore();
  }
  return new MemoryLocalStore();
}
