export type KitchenStation = "PIZZA" | "PLATS" | "SNACK" | "CAFETERIA";
export type PrinterRole = "KITCHEN" | "CASHIER" | "RECEIPT";

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
  host: string;
  port: string;
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
    host: "",
    port: "9100",
    driver: "NETWORK_TCP",
    paperWidthChars: "32",
    isDefault: false,
    isActive: true,
  };
}

export function printerToForm(p: ApiPrinter): PrinterFormState {
  const { host, port } = parseConnectionHostPort(p.connectionJson);
  return {
    name: p.name,
    role: p.role,
    kitchenStation: p.kitchenStation ?? "",
    host,
    port: String(port),
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

export function formatPrinterConnection(cj: unknown): string {
  if (!cj || typeof cj !== "object") return "—";
  const o = cj as Record<string, unknown>;
  const t = o.transport;
  if (t === "tcp" || o.host || o.ip) {
    const { host, port } = parseConnectionHostPort(cj);
    return host ? `${host}:${port}` : "—";
  }
  if (t === "usb") return String(o.devicePath ?? "USB");
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

export function buildCreatePrinterBody(form: PrinterFormState): Record<string, unknown> {
  const port = parseInt(form.port, 10) || 9100;
  return {
    name: form.name.trim(),
    role: form.role,
    kitchenStation: form.role === "KITCHEN" && form.kitchenStation ? form.kitchenStation : null,
    driver: form.driver.trim() || "NETWORK_TCP",
    connectionJson: buildTcpConnectionJson(form.host, port),
    paperWidthChars: parsePaperWidth(form.paperWidthChars),
    isDefault: form.isDefault,
    isActive: form.isActive,
  };
}

export function buildUpdatePrinterBody(form: PrinterFormState): Record<string, unknown> {
  return buildCreatePrinterBody(form);
}
