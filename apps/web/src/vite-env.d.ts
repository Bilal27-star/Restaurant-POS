/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base origin for health checks, e.g. `http://localhost:4000` */
  readonly VITE_API_ORIGIN?: string;
  /** Injected when `vite build` runs under `tauri build` (desktop bundles). */
  readonly TAURI_ENV_PLATFORM?: string;
  readonly TAURI_ENV_FAMILY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
