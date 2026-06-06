import { isTauriDesktop } from "./desktop/tauri-host";

export type LanApiMode = "local" | "remote";

export type LanApiConfig = {
  mode: LanApiMode;
  host: string;
  port: number;
};

const MODE_KEY = "pos_api_mode";
const HOST_KEY = "pos_api_server_host";
const PORT_KEY = "pos_api_server_port";

const DEFAULT_MODE: LanApiMode = "local";
const DEFAULT_PORT = 4000;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function sanitizePort(value: number): number {
  if (Number.isFinite(value) && value > 0 && value <= 65535) return Math.trunc(value);
  return DEFAULT_PORT;
}

function getLocalApiOrigin(): string {
  if (isTauriDesktop()) {
    return `http://127.0.0.1:${DEFAULT_PORT}`;
  }
  if (import.meta.env.DEV) {
    /** Same-origin via Vite proxy (`/api` → :4000) so httpOnly refresh cookies work in browser dev. */
    return "";
  }
  return "";
}

export function getLanApiConfig(): LanApiConfig {
  const modeRaw = readStorage(MODE_KEY);
  const mode: LanApiMode = modeRaw === "remote" ? "remote" : DEFAULT_MODE;

  const host = readStorage(HOST_KEY)?.trim() ?? "";

  const portRaw = readStorage(PORT_KEY);
  const parsedPort = Number.parseInt(portRaw ?? "", 10);
  const port = sanitizePort(parsedPort);

  return { mode, host, port };
}

export function setLanApiConfig(config: LanApiConfig): void {
  writeStorage(MODE_KEY, config.mode === "remote" ? "remote" : "local");
  writeStorage(HOST_KEY, config.host.trim());
  writeStorage(PORT_KEY, String(sanitizePort(config.port)));
}

export function clearLanApiConfig(): void {
  removeStorage(MODE_KEY);
  removeStorage(HOST_KEY);
  removeStorage(PORT_KEY);
}

export function getResolvedApiOrigin(): string {
  const viteOrigin = import.meta.env.VITE_API_ORIGIN;
  if (typeof viteOrigin === "string" && viteOrigin.length > 0) {
    return viteOrigin.replace(/\/$/, "");
  }

  const config = getLanApiConfig();
  if (config.mode === "remote" && config.host) {
    return `http://${config.host}:${config.port}`;
  }

  return getLocalApiOrigin();
}
