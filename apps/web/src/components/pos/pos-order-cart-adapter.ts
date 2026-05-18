import type { PosCartLine } from "@/stores/pos-order-store";

import type { PosCartExtraLine, PosCartIngredientLine, PosCartLineItem } from "./pos-cart-types";

export function posCartLineToPanelItem(line: PosCartLine): PosCartLineItem {
  const extras: PosCartExtraLine[] = line.modifierSelections.map((m) => ({
    id: m.modifierId,
    label: m.quantity > 1 ? `${m.label} ×${m.quantity}` : m.label,
    priceEachDa: m.priceEachDa * m.quantity,
  }));

  let ingredients: PosCartIngredientLine[];
  if (line.ingredients.length > 0) {
    ingredients = line.ingredients.map((i) => ({ ...i }));
  } else if (line.removedIngredientLabels && line.removedIngredientLabels.length > 0) {
    ingredients = line.removedIngredientLabels.map((name) => ({
      id: `r-${name}`,
      label: name,
      included: false,
    }));
  } else {
    ingredients = [];
  }

  return {
    id: line.id,
    productId: line.menuItemId,
    name: line.name,
    readOnly: !line.isDraftLine,
    quantity: line.quantity,
    baseUnitPriceDa: line.baseUnitPriceDa,
    extrasUnitTotalDa: line.extrasUnitTotalDa,
    unitPriceDa: line.unitPriceDa,
    lineTotalDa: line.lineTotalDa,
    ingredients,
    extras,
    notes: line.notes,
  };
}

export type OrderCreateLineBody = {
  menuItemId: string;
  quantity: number;
  modifierIds: string[];
  removedIngredientIds: string[];
  kitchenNotes: string | null;
};

/** Matches `POST /api/v1/orders` body (`createOrderBody` on the API). */
export type OrderCreateBody = {
  type: "DINE_IN" | "TAKEAWAY";
  tableId?: string | null;
  customerId?: string | null;
  waiterId?: string | null;
  partySize?: number | null;
  kitchenNotes?: string | null;
  customerNotes?: string | null;
  clientMutationId?: string | null;
  taxTotal?: string;
  discountTotal?: string;
  lines: OrderCreateLineBody[];
};

export function cartLinesToOrderApiLines(lines: PosCartLine[]): OrderCreateLineBody[] {
  return lines.map((l) => {
    const modifierIds: string[] = [];
    for (const m of l.modifierSelections) {
      for (let i = 0; i < m.quantity; i++) {
        modifierIds.push(m.modifierId);
      }
    }
    return {
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      modifierIds,
      removedIngredientIds: l.removedIngredientIds,
      kitchenNotes: l.notes.trim() ? l.notes.trim() : null,
    };
  });
}

/** Build a strict order-create payload (no kitchen-ticket / print-only fields). */
export function buildOrderCreateBody(input: OrderCreateBody): OrderCreateBody {
  return {
    type: input.type,
    ...(input.tableId !== undefined ? { tableId: input.tableId } : {}),
    ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
    ...(input.waiterId !== undefined ? { waiterId: input.waiterId } : {}),
    ...(input.partySize !== undefined ? { partySize: input.partySize } : {}),
    ...(input.kitchenNotes !== undefined ? { kitchenNotes: input.kitchenNotes } : {}),
    ...(input.customerNotes !== undefined ? { customerNotes: input.customerNotes } : {}),
    ...(input.clientMutationId !== undefined ? { clientMutationId: input.clientMutationId } : {}),
    ...(input.taxTotal !== undefined ? { taxTotal: input.taxTotal } : {}),
    ...(input.discountTotal !== undefined ? { discountTotal: input.discountTotal } : {}),
    lines: input.lines.map((l) => ({
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      modifierIds: l.modifierIds ?? [],
      removedIngredientIds: l.removedIngredientIds ?? [],
      kitchenNotes: l.kitchenNotes ?? null,
    })),
  };
}

/** Kitchen-ticket / print metadata — must never be sent on REST order mutations. */
const ORDER_PRINT_ROUTING_KEYS = ["station", "waiterName"] as const;

function omitOrderPrintRoutingFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  for (const key of ORDER_PRINT_ROUTING_KEYS) {
    delete out[key];
  }
  return out;
}

/** Matches `PATCH /api/v1/orders/:id` body (`patchOrderBody` on the API). */
export type OrderPatchBody = {
  kitchenNotes?: string | null;
  customerNotes?: string | null;
  status?: "PENDING" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
  customerId?: string | null;
  waiterId?: string | null;
  partySize?: number | null;
  taxTotal?: string | null;
  discountTotal?: string | null;
  version?: number;
};

export function buildOrderPatchBody(input: OrderPatchBody): OrderPatchBody {
  const body: OrderPatchBody = {};
  if (input.kitchenNotes !== undefined) body.kitchenNotes = input.kitchenNotes;
  if (input.customerNotes !== undefined) body.customerNotes = input.customerNotes;
  if (input.status !== undefined) body.status = input.status;
  if (input.customerId !== undefined) body.customerId = input.customerId;
  if (input.waiterId !== undefined) body.waiterId = input.waiterId;
  if (input.partySize !== undefined) body.partySize = input.partySize;
  if (input.taxTotal !== undefined) body.taxTotal = input.taxTotal;
  if (input.discountTotal !== undefined) body.discountTotal = input.discountTotal;
  if (input.version !== undefined) body.version = input.version;
  return body;
}

export function sanitizeOrderPatchPayload(raw: Record<string, unknown>): OrderPatchBody {
  const cleaned = omitOrderPrintRoutingFields(raw);
  const body: OrderPatchBody = {};
  if ("kitchenNotes" in cleaned) {
    const kn = cleaned.kitchenNotes;
    body.kitchenNotes = typeof kn === "string" || kn === null ? kn : null;
  }
  if ("customerNotes" in cleaned) {
    const cn = cleaned.customerNotes;
    body.customerNotes = typeof cn === "string" || cn === null ? cn : null;
  }
  if (typeof cleaned.status === "string") {
    const s = cleaned.status;
    if (s === "PENDING" || s === "PREPARING" || s === "READY" || s === "COMPLETED" || s === "CANCELLED") {
      body.status = s;
    }
  }
  if ("customerId" in cleaned) body.customerId = cleaned.customerId as string | null;
  if ("waiterId" in cleaned) body.waiterId = cleaned.waiterId as string | null;
  if ("partySize" in cleaned) {
    const ps = cleaned.partySize;
    body.partySize =
      typeof ps === "number" ? ps : ps === null ? null : Number.parseInt(String(ps), 10) || null;
  }
  if ("taxTotal" in cleaned) {
    const t = cleaned.taxTotal;
    body.taxTotal = typeof t === "string" || t === null ? t : null;
  }
  if ("discountTotal" in cleaned) {
    const d = cleaned.discountTotal;
    body.discountTotal = typeof d === "string" || d === null ? d : null;
  }
  if (cleaned.version !== undefined) {
    const v = cleaned.version;
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    if (Number.isFinite(n) && n >= 1) body.version = n;
  }
  return buildOrderPatchBody(body);
}

/** Matches `POST /api/v1/orders/:id/lines` body (`addOrderLinesBody` on the API). */
export type AddOrderLinesBody = {
  lines: OrderCreateLineBody[];
  version?: number;
};

export function buildAddOrderLinesBody(input: AddOrderLinesBody): AddOrderLinesBody {
  return {
    lines: input.lines.map((l) => ({
      menuItemId: l.menuItemId,
      quantity: l.quantity,
      modifierIds: l.modifierIds ?? [],
      removedIngredientIds: l.removedIngredientIds ?? [],
      kitchenNotes: l.kitchenNotes ?? null,
    })),
    ...(input.version !== undefined ? { version: input.version } : {}),
  };
}

/** Matches `PATCH /api/v1/orders/:id/lines/:lineId` body (`patchOrderLineBody` on the API). */
export type OrderLinePatchBody = {
  quantity?: number;
  modifierIds?: string[];
  removedIngredientIds?: string[];
  kitchenNotes?: string | null;
  version?: number;
};

export function buildOrderLinePatchBody(input: OrderLinePatchBody): OrderLinePatchBody {
  const body: OrderLinePatchBody = {};
  if (input.quantity !== undefined) body.quantity = input.quantity;
  if (input.modifierIds !== undefined) body.modifierIds = input.modifierIds;
  if (input.removedIngredientIds !== undefined) body.removedIngredientIds = input.removedIngredientIds;
  if (input.kitchenNotes !== undefined) body.kitchenNotes = input.kitchenNotes;
  if (input.version !== undefined) body.version = input.version;
  return body;
}

/** Matches `POST .../complete` and `POST .../cancel` optional version body. */
export function sanitizeOrderVersionPayload(raw: Record<string, unknown>): { version?: number } {
  const cleaned = omitOrderPrintRoutingFields(raw);
  if (cleaned.version === undefined) return {};
  const v = cleaned.version;
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  if (Number.isFinite(n) && n >= 1) return { version: n };
  return {};
}

export function sanitizeOrderLinePatchPayload(raw: Record<string, unknown>): OrderLinePatchBody {
  const cleaned = omitOrderPrintRoutingFields(raw);
  const body: OrderLinePatchBody = {};
  if (cleaned.quantity !== undefined) {
    const q = cleaned.quantity;
    const n = typeof q === "number" ? q : Number.parseInt(String(q), 10);
    if (Number.isFinite(n) && n >= 1) body.quantity = n;
  }
  if (Array.isArray(cleaned.modifierIds)) {
    body.modifierIds = cleaned.modifierIds.filter((x): x is string => typeof x === "string");
  }
  if (Array.isArray(cleaned.removedIngredientIds)) {
    body.removedIngredientIds = cleaned.removedIngredientIds.filter((x): x is string => typeof x === "string");
  }
  if ("kitchenNotes" in cleaned) {
    const kn = cleaned.kitchenNotes;
    body.kitchenNotes = typeof kn === "string" || kn === null ? kn : null;
  }
  if (cleaned.version !== undefined) {
    const v = cleaned.version;
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    if (Number.isFinite(n) && n >= 1) body.version = n;
  }
  return buildOrderLinePatchBody(body);
}

export function sanitizeAddOrderLinesPayload(raw: Record<string, unknown>): AddOrderLinesBody {
  const cleaned = omitOrderPrintRoutingFields(raw);
  const lines: OrderCreateLineBody[] = [];
  if (Array.isArray(cleaned.lines)) {
    for (const row of cleaned.lines) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const menuItemId = typeof r.menuItemId === "string" ? r.menuItemId : "";
      const quantity =
        typeof r.quantity === "number" ? r.quantity : Number.parseInt(String(r.quantity ?? ""), 10);
      if (!menuItemId || !Number.isFinite(quantity) || quantity < 1) continue;
      lines.push({
        menuItemId,
        quantity,
        modifierIds: Array.isArray(r.modifierIds)
          ? r.modifierIds.filter((x): x is string => typeof x === "string")
          : [],
        removedIngredientIds: Array.isArray(r.removedIngredientIds)
          ? r.removedIngredientIds.filter((x): x is string => typeof x === "string")
          : [],
        kitchenNotes:
          typeof r.kitchenNotes === "string" || r.kitchenNotes === null
            ? (r.kitchenNotes as string | null)
            : null,
      });
    }
  }
  const body: AddOrderLinesBody = { lines };
  if (cleaned.version !== undefined) {
    const v = cleaned.version;
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    if (Number.isFinite(n) && n >= 1) body.version = n;
  }
  return buildAddOrderLinesBody(body);
}

/** Drop print-routing fields (e.g. `station`, `waiterName`) from stored/offline payloads. */
export function sanitizeOrderCreatePayload(raw: Record<string, unknown>): OrderCreateBody {
  const cleaned = omitOrderPrintRoutingFields(raw);
  const type = cleaned.type === "TAKEAWAY" ? "TAKEAWAY" : "DINE_IN";
  const lines: OrderCreateLineBody[] = [];
  if (Array.isArray(cleaned.lines)) {
    for (const row of cleaned.lines) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const menuItemId = typeof r.menuItemId === "string" ? r.menuItemId : "";
      const quantity =
        typeof r.quantity === "number" ? r.quantity : Number.parseInt(String(r.quantity ?? ""), 10);
      if (!menuItemId || !Number.isFinite(quantity) || quantity < 1) continue;
      lines.push({
        menuItemId,
        quantity,
        modifierIds: Array.isArray(r.modifierIds)
          ? r.modifierIds.filter((x): x is string => typeof x === "string")
          : [],
        removedIngredientIds: Array.isArray(r.removedIngredientIds)
          ? r.removedIngredientIds.filter((x): x is string => typeof x === "string")
          : [],
        kitchenNotes:
          typeof r.kitchenNotes === "string" || r.kitchenNotes === null
            ? (r.kitchenNotes as string | null)
            : null,
      });
    }
  }

  const body: OrderCreateBody = { type, lines };
  if ("tableId" in cleaned) body.tableId = cleaned.tableId as string | null;
  if ("customerId" in cleaned) body.customerId = cleaned.customerId as string | null;
  if ("waiterId" in cleaned) body.waiterId = cleaned.waiterId as string | null;
  if ("partySize" in cleaned) {
    const ps = cleaned.partySize;
    body.partySize =
      typeof ps === "number" ? ps : ps === null ? null : Number.parseInt(String(ps), 10) || null;
  }
  if ("kitchenNotes" in cleaned) {
    const kn = cleaned.kitchenNotes;
    body.kitchenNotes = typeof kn === "string" || kn === null ? kn : null;
  }
  if ("customerNotes" in cleaned) {
    const cn = cleaned.customerNotes;
    body.customerNotes = typeof cn === "string" || cn === null ? cn : null;
  }
  if ("clientMutationId" in cleaned) {
    const cm = cleaned.clientMutationId;
    body.clientMutationId = typeof cm === "string" || cm === null ? cm : null;
  }
  if (typeof cleaned.taxTotal === "string") body.taxTotal = cleaned.taxTotal;
  if (typeof cleaned.discountTotal === "string") body.discountTotal = cleaned.discountTotal;

  return buildOrderCreateBody(body);
}
