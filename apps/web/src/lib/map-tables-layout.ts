import type { FloorDef, OrderLineItem, RestaurantTable, TableOrder, TableStatus } from "@/components/tables/tables-demo-data";

function mapTableStatus(api: string): TableStatus {
  switch (api) {
    case "FREE":
      return "free";
    case "OCCUPIED":
      return "occupied";
    case "RESERVED":
      return "reserved";
    case "PAYMENT_PENDING":
      return "occupied";
    default:
      return "free";
  }
}

function mapPaymentStatus(s: string | undefined): TableOrder["paymentStatus"] {
  switch (s) {
    case "UNPAID":
      return "unpaid";
    case "PARTIALLY_PAID":
      return "partial";
    case "PAID":
      return "paid";
    case "REFUNDED":
      return "paid";
    default:
      return "unpaid";
  }
}

function elapsedLabel(openedAt: string): string {
  const t = Date.parse(openedAt);
  if (Number.isNaN(t)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m ? `${m}m` : ""}`;
}

function mapOrderLinesFromApi(o: Record<string, unknown>): OrderLineItem[] {
  const rawItems = o.items;
  if (!Array.isArray(rawItems)) return [];
  const out: OrderLineItem[] = [];
  for (const row of rawItems) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const qty = typeof r.quantity === "number" ? r.quantity : Number(r.quantity);
    const name = typeof r.nameSnapshot === "string" ? r.nameSnapshot : "";
    if (!Number.isFinite(qty) || qty <= 0 || !name) continue;
    out.push({ qty, name });
  }
  return out;
}

function mapOrder(o: Record<string, unknown> | null | undefined): TableOrder | undefined {
  if (!o || typeof o !== "object") return undefined;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) return undefined;
  const orderNumber = typeof o.orderNumber === "string" ? o.orderNumber.replace(/^#/, "") : "";
  const ticketPublicCode = typeof o.ticketPublicCode === "string" ? o.ticketPublicCode : "";
  const partySize = typeof o.partySize === "number" ? o.partySize : typeof o.partySize === "string" ? Number(o.partySize) : 0;
  const total =
    typeof o.total === "string"
      ? o.total
      : typeof o.total === "object" && o.total !== null && "toString" in o.total
        ? String((o.total as { toString: () => string }).toString())
        : "0";
  const totalNum = Number.parseFloat(total || "0");
  const totalAmount = Number.isFinite(totalNum) ? totalNum.toFixed(2) : "0.00";
  const items =
    typeof o._count === "object" && o._count !== null && typeof (o._count as { items?: unknown }).items === "number"
      ? (o._count as { items: number }).items
      : 0;
  const waiter = typeof o.waiter === "object" && o.waiter !== null && "fullName" in (o.waiter as object)
    ? String((o.waiter as { fullName?: string }).fullName ?? "")
    : "";
  const openedAt = typeof o.openedAt === "string" ? o.openedAt : new Date().toISOString();
  const paymentStatus = mapPaymentStatus(typeof o.paymentStatus === "string" ? o.paymentStatus : undefined);
  const version = typeof o.version === "number" ? o.version : typeof o.version === "string" ? Number(o.version) : undefined;
  const lines = mapOrderLinesFromApi(o);

  return {
    id,
    orderNumber,
    ticketPublicCode,
    items,
    guests: Number.isFinite(partySize) && partySize > 0 ? partySize : 1,
    totalLabel: `${Number.parseFloat(total || "0").toLocaleString("fr-DZ")} DA`,
    totalAmount,
    elapsedLabel: elapsedLabel(openedAt),
    waiterName: waiter || undefined,
    paymentStatus,
    lines: lines.length > 0 ? lines : undefined,
    version: Number.isFinite(version) ? version : undefined,
  };
}

function mapTable(raw: unknown): RestaurantTable {
  const t = raw as Record<string, unknown>;
  const id = String(t.id ?? "");
  const numberLabel = String(t.number ?? "");
  const capacity = typeof t.capacity === "number" ? t.capacity : Number(t.capacity) || 4;
  const status = mapTableStatus(String(t.status ?? "FREE"));
  const currentOrder = mapOrder(
    typeof t.currentOrder === "object" && t.currentOrder !== null ? (t.currentOrder as Record<string, unknown>) : undefined,
  );
  const occupied = status === "occupied" || Boolean(currentOrder);
  return {
    id,
    numberLabel,
    capacity,
    status: occupied && currentOrder ? "occupied" : status,
    order: currentOrder,
  };
}

export function mapTablesLayoutPayload(raw: unknown): FloorDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => {
    const row = f as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      tables: Array.isArray(row.tables) ? row.tables.map(mapTable) : [],
    };
  });
}
