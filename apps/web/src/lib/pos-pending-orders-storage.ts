const STORAGE_PREFIX = "pos:pending_orders:v1:";

export type PendingPosOrderPayload = {
  v: 1;
  clientMutationId: string;
  createdAtMs: number;
  /** DINE_IN order create body (matches API) */
  body: {
    type: "DINE_IN";
    tableId: string;
    partySize?: number | null;
    kitchenNotes?: string | null;
    customerNotes?: string | null;
    lines: {
      menuItemId: string;
      quantity: number;
      modifierIds: string[];
      removedIngredientIds: string[];
      kitchenNotes: string | null;
    }[];
  };
};

function key(tenantId: string): string {
  return `${STORAGE_PREFIX}${tenantId}`;
}

export function loadPendingPosOrders(tenantId: string): PendingPosOrderPayload[] {
  try {
    const raw = localStorage.getItem(key(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is PendingPosOrderPayload => {
      if (!x || typeof x !== "object") return false;
      const o = x as Record<string, unknown>;
      return o.v === 1 && typeof o.clientMutationId === "string" && typeof o.body === "object" && o.body !== null;
    });
  } catch {
    return [];
  }
}

export function savePendingPosOrders(tenantId: string, rows: PendingPosOrderPayload[]): void {
  try {
    localStorage.setItem(key(tenantId), JSON.stringify(rows));
  } catch {
    /* quota / private mode */
  }
}

export function enqueuePendingPosOrder(tenantId: string, row: PendingPosOrderPayload): void {
  const cur = loadPendingPosOrders(tenantId);
  cur.push(row);
  savePendingPosOrders(tenantId, cur);
}

export function removePendingPosOrder(tenantId: string, clientMutationId: string): void {
  const cur = loadPendingPosOrders(tenantId).filter((r) => r.clientMutationId !== clientMutationId);
  savePendingPosOrders(tenantId, cur);
}
