export type ApiConnectionMode = "local" | "remote";

const MODE_KEY = "pos_api_mode";
const HOST_KEY = "pos_api_server_host";
const PORT_KEY = "pos_api_server_port";

const DEFAULT_MODE: ApiConnectionMode = "local";
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

export function getConnectionMode(): ApiConnectionMode {
  const raw = readStorage(MODE_KEY);
  return raw === "remote" ? "remote" : DEFAULT_MODE;
}

export function setConnectionMode(mode: ApiConnectionMode): void {
  writeStorage(MODE_KEY, mode);
}

export function getRemoteApiHost(): string {
  return readStorage(HOST_KEY)?.trim() ?? "";
}

export function setRemoteApiHost(host: string): void {
  writeStorage(HOST_KEY, host.trim());
}

export function getRemoteApiPort(): number {
  const raw = readStorage(PORT_KEY);
  if (!raw) return DEFAULT_PORT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : DEFAULT_PORT;
}

export function setRemoteApiPort(port: number): void {
  writeStorage(PORT_KEY, String(port));
}

/** `http://host:port` when mode is remote and host is set; otherwise `null`. */
export function getRemoteApiOrigin(): string | null {
  if (getConnectionMode() !== "remote") return null;
  const host = getRemoteApiHost();
  if (!host) return null;
  return `http://${host}:${getRemoteApiPort()}`;
}
