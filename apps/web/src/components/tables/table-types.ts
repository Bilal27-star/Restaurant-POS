/**
 * Dine-in table UI types and small display helpers.
 * Layout data is loaded from the API (`/tables/layout`); no mock floor grids.
 */

export type TableStatus = "free" | "occupied" | "reserved";

export interface OrderLineItem {
  qty: number;
  name: string;
  /** Extra line (e.g. modifiers) shown under the item name. */
  detail?: string;
}

export type DineInPaymentStatus = "unpaid" | "partial" | "paid";

export interface TableOrder {
  /** Stable correlation id (UUID from API). */
  id: string;
  orderNumber: string;
  ticketPublicCode: string;
  items: number;
  guests: number;
  totalLabel: string;
  /** Decimal string from API (`order.total`) for payments — matches server totals. */
  totalAmount: string;
  elapsedLabel: string;
  waiterName?: string;
  lines?: OrderLineItem[];
  lastTicketPrintedAtMs?: number;
  paymentStatus?: DineInPaymentStatus;
  /** API order row version (for optimistic updates / payments). */
  version?: number;
}

/** Display reference for UI and tickets, e.g. `#4821`. */
export function orderDisplayRef(order: TableOrder): string {
  const raw = order.orderNumber.replace(/^#/, "").trim();
  return raw.startsWith("#") ? raw : `#${raw}`;
}

/** Uses only API-provided `order.lines` when present; otherwise empty (no fabricated lines). */
export function defaultOrderLinesForDisplay(order: TableOrder): OrderLineItem[] {
  if (order.lines?.length) return order.lines;
  return [];
}

export interface RestaurantTable {
  id: string;
  numberLabel: string;
  status: TableStatus;
  capacity?: number;
  order?: TableOrder;
  reservedNote?: string;
}

export interface FloorDef {
  id: string;
  name: string;
  tables: RestaurantTable[];
}
