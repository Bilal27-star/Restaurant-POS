import type { FloorDef, RestaurantTable, TableOrder } from "@/components/tables/tables-demo-data";
import { orderDisplayRef } from "@/components/tables/tables-demo-data";

export type DineInOrderLookupHit = {
  floorId: string;
  floorName: string;
  table: RestaurantTable;
  order: TableOrder;
};

function normalizeToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function collectOccupied(floors: FloorDef[]): DineInOrderLookupHit[] {
  const out: DineInOrderLookupHit[] = [];
  for (const floor of floors) {
    for (const table of floor.tables) {
      if (table.status !== "occupied" || !table.order) continue;
      out.push({ floorId: floor.id, floorName: floor.name, table, order: table.order });
    }
  }
  return out;
}

function matchesTableLabel(table: RestaurantTable, q: string): boolean {
  const num = table.numberLabel.trim().toLowerCase();
  if (q === num) return true;
  if (q === `t${num}`) return true;
  if (q === `table${num}`) return true;
  if (q === `salle${num}`) return true;
  return false;
}

function matchesOrder(order: TableOrder, q: string): boolean {
  const numRaw = order.orderNumber.replace(/^#/, "").trim().toLowerCase();
  const withHash = orderDisplayRef(order).replace(/^#/, "").toLowerCase();
  if (q === numRaw || q === withHash) return true;
  if (q.length >= 3 && (numRaw.includes(q) || withHash.includes(q))) return true;
  const code = order.ticketPublicCode.trim().toLowerCase();
  if (code && (q === code || code.includes(q))) return true;
  const idTail = order.id.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (q.length >= 4 && idTail.includes(q)) return true;
  return false;
}

/** Instant filter for cashier search: table (T12, 12), order (#4821, 4821), or ticket public code. */
export function searchDineInOrders(floors: FloorDef[], rawQuery: string): DineInOrderLookupHit[] {
  const q = normalizeToken(rawQuery);
  if (!q) return [];
  const entries = collectOccupied(floors);
  return entries.filter((hit) => matchesTableLabel(hit.table, q) || matchesOrder(hit.order, q));
}
