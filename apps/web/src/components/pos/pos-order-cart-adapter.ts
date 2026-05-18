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

/** Drop print-routing fields (e.g. `station`, `waiterName`) from stored/offline payloads. */
export function sanitizeOrderCreatePayload(raw: Record<string, unknown>): OrderCreateBody {
  const type = raw.type === "TAKEAWAY" ? "TAKEAWAY" : "DINE_IN";
  const lines: OrderCreateLineBody[] = [];
  if (Array.isArray(raw.lines)) {
    for (const row of raw.lines) {
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
  if ("tableId" in raw) body.tableId = raw.tableId as string | null;
  if ("customerId" in raw) body.customerId = raw.customerId as string | null;
  if ("waiterId" in raw) body.waiterId = raw.waiterId as string | null;
  if ("partySize" in raw) {
    const ps = raw.partySize;
    body.partySize =
      typeof ps === "number" ? ps : ps === null ? null : Number.parseInt(String(ps), 10) || null;
  }
  if ("kitchenNotes" in raw) {
    const kn = raw.kitchenNotes;
    body.kitchenNotes = typeof kn === "string" || kn === null ? kn : null;
  }
  if ("customerNotes" in raw) {
    const cn = raw.customerNotes;
    body.customerNotes = typeof cn === "string" || cn === null ? cn : null;
  }
  if ("clientMutationId" in raw) {
    const cm = raw.clientMutationId;
    body.clientMutationId = typeof cm === "string" || cm === null ? cm : null;
  }
  if (typeof raw.taxTotal === "string") body.taxTotal = raw.taxTotal;
  if (typeof raw.discountTotal === "string") body.discountTotal = raw.discountTotal;

  return buildOrderCreateBody(body);
}
