export type KitchenStation = "PIZZA" | "PLATS" | "SNACK" | "CAFETERIA";
export type PrinterRole = "KITCHEN" | "CASHIER" | "RECEIPT";
export type PrinterTransport = "tcp" | "usb" | "winspool";

export type ApiPrinter = {
  id: string;
  name: string;
  role: PrinterRole;
  kitchenStation: KitchenStation | null;
  driver: string;
  connectionJson: unknown;
  paperWidthChars: number;
  isDefault: boolean;
  isActive: boolean;
};

export type DiscoveredPrinter = {
  name: string;
  host: string;
  port: number;
  status: "online";
};

export type PrinterFormState = {
  name: string;
  role: PrinterRole;
  kitchenStation: KitchenStation | "";
  transport: PrinterTransport;
  host: string;
  port: string;
  devicePath: string;
  printerName: string;
  driver: string;
  paperWidthChars: string;
  isDefault: boolean;
  isActive: boolean;
};

export const KITCHEN_STATIONS: { value: KitchenStation; label: string }[] = [
  { value: "PIZZA", label: "Pizza" },
  { value: "PLATS", label: "Plats" },
  { value: "SNACK", label: "Snack" },
  { value: "CAFETERIA", label: "Cafétéria" },
];

export function emptyPrinterForm(): PrinterFormState {
  return {
    name: "",
    role: "KITCHEN",
    kitchenStation: "",
    transport: "tcp",
    host: "",
    port: "9100",
    devicePath: "",
    printerName: "",
    driver: "NETWORK_TCP",
    paperWidthChars: "32",
    isDefault: false,
    isActive: true,
  };
}

export function parsePrinterTransport(cj: unknown): PrinterTransport {
  if (!cj || typeof cj !== "object") return "tcp";
  const t = String((cj as Record<string, unknown>).transport ?? "tcp").toLowerCase();
  if (t === "usb") return "usb";
  if (t === "winspool") return "winspool";
  return "tcp";
}

export function printerToForm(p: ApiPrinter): PrinterFormState {
  const transport = parsePrinterTransport(p.connectionJson);
  const cj = p.connectionJson as Record<string, unknown>;
  const { host, port } = parseConnectionHostPort(p.connectionJson);
  return {
    name: p.name,
    role: p.role,
    kitchenStation: p.kitchenStation ?? "",
    transport,
    host,
    port: String(port),
    devicePath: transport === "usb" ? String(cj.devicePath ?? "") : "",
    printerName: transport === "winspool" ? String(cj.printerName ?? "") : "",
    driver: p.driver,
    paperWidthChars: String(p.paperWidthChars),
    isDefault: p.isDefault,
    isActive: p.isActive,
  };
}

export function formFromDiscovered(host: string, port: number, station?: KitchenStation): PrinterFormState {
  return {
    ...emptyPrinterForm(),
    name: `Imprimante ${host}`,
    host,
    port: String(port),
    kitchenStation: station ?? "",
    driver: "NETWORK_TCP",
    transport: "tcp",
  };
}

export function parseConnectionHostPort(cj: unknown): { host: string; port: number } {
  if (!cj || typeof cj !== "object") return { host: "", port: 9100 };
  const o = cj as Record<string, unknown>;
  const host = String(o.host ?? o.ip ?? "").trim();
  const port = Number(o.port ?? 9100);
  return { host, port: Number.isFinite(port) && port > 0 ? port : 9100 };
}

export function buildTcpConnectionJson(host: string, port: number): Record<string, unknown> {
  return { transport: "tcp", host: host.trim(), port };
}

export function buildConnectionJson(form: PrinterFormState): Record<string, unknown> {
  const port = parseInt(form.port, 10) || 9100;
  switch (form.transport) {
    case "usb":
      return { transport: "usb", devicePath: form.devicePath.trim() };
    case "winspool":
      return { transport: "winspool", printerName: form.printerName.trim() };
    default:
      return buildTcpConnectionJson(form.host, port);
  }
}

export function formatPrinterConnection(cj: unknown): string {
  if (!cj || typeof cj !== "object") return "—";
  const o = cj as Record<string, unknown>;
  const t = String(o.transport ?? "").toLowerCase();
  if (t === "tcp" || o.host || o.ip) {
    const { host, port } = parseConnectionHostPort(cj);
    return host ? `${host}:${port}` : "—";
  }
  if (t === "usb") return `USB: ${String(o.devicePath ?? "—")}`;
  if (t === "winspool") return `Windows: ${String(o.printerName ?? "—")}`;
  if (t === "file") return String(o.path ?? "fichier");
  return "JSON";
}

export function kitchenStationLabel(station: KitchenStation | null | undefined): string {
  if (!station) return "—";
  return KITCHEN_STATIONS.find((s) => s.value === station)?.label ?? station;
}

export function printerRoleLabelFr(role: string): string {
  switch (role) {
    case "KITCHEN":
      return "Cuisine";
    case "RECEIPT":
      return "Tickets";
    case "CASHIER":
      return "Caisse";
    default:
      return role;
  }
}

function parsePaperWidth(raw: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 32;
  return Math.min(64, Math.max(24, n));
}

function driverForTransport(transport: PrinterTransport): string {
  return transport === "tcp" ? "NETWORK_TCP" : "RAW_ESCPOS";
}

export function buildCreatePrinterBody(form: PrinterFormState): Record<string, unknown> {
  return {
    name: form.name.trim(),
    role: form.role,
    kitchenStation: form.role === "KITCHEN" && form.kitchenStation ? form.kitchenStation : null,
    driver: form.driver.trim() || driverForTransport(form.transport),
    connectionJson: buildConnectionJson(form),
    paperWidthChars: parsePaperWidth(form.paperWidthChars),
    isDefault: form.isDefault,
    isActive: form.isActive,
  };
}

export function buildUpdatePrinterBody(form: PrinterFormState): Record<string, unknown> {
  return buildCreatePrinterBody(form);
}

export function isTcpPrinter(cj: unknown): boolean {
  return parsePrinterTransport(cj) === "tcp";
}
