import { create } from "zustand";

export type PosModifierCartSelection = {
  modifierId: string;
  label: string;
  priceEachDa: number;
  quantity: number;
};

export type PosCartLine = {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  baseUnitPriceDa: number;
  extrasUnitTotalDa: number;
  unitPriceDa: number;
  lineTotalDa: number;
  modifierSelections: PosModifierCartSelection[];
  removedIngredientIds: string[];
  /** When known from menu template */
  ingredients: { id: string; label: string; included: boolean }[];
  /** When hydrating from server snapshot (names only) */
  removedIngredientLabels?: string[];
  notes: string;
  /** New lines created on POS; false = loaded from an active server order. */
  isDraftLine: boolean;
  /** Server kitchen line state (hydrated orders). */
  kitchenStatus: string;
};

function newLineId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ln-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function recalcLine(line: PosCartLine): PosCartLine {
  const extrasUnit = line.modifierSelections.reduce((s, m) => s + m.priceEachDa * m.quantity, 0);
  const unit = line.baseUnitPriceDa + extrasUnit;
  const lineTotal = Math.round(unit * line.quantity);
  return { ...line, extrasUnitTotalDa: extrasUnit, unitPriceDa: unit, lineTotalDa: lineTotal };
}

function parseMoneyDa(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export type PosOrderHydrateItem = {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  quantity: number;
  unitPrice: string;
  kitchenNotes?: string | null;
  kitchenStatus?: string;
  removedIngredients?: unknown;
  modifiers?: { modifierId: string | null; label: string; priceDelta: string }[];
};

/** True when the order has unsent kitchen deltas (ADD drafts, UPDATE lines, or pending deletes). */
export function orderHasPendingKitchenSend(
  lines: Pick<PosCartLine, "isDraftLine" | "kitchenStatus">[],
  pendingKitchenRemovalCount: number,
): boolean {
  if (lines.some((l) => l.isDraftLine)) return true;
  if (pendingKitchenRemovalCount > 0) return true;
  return lines.some((l) => !l.isDraftLine && l.kitchenStatus === "MODIFIED");
}

function hydrateItemsToLines(items: PosOrderHydrateItem[]): PosCartLine[] {
  const lines: PosCartLine[] = [];
  for (const it of items) {
    if (!it.menuItemId) continue;
    const base = parseMoneyDa(it.unitPrice);
    const mods = Array.isArray(it.modifiers) ? it.modifiers : [];
    const counts = new Map<string, { label: string; priceEachDa: number; qty: number }>();
    for (const m of mods) {
      if (!m.modifierId) continue;
      const price = parseMoneyDa(m.priceDelta);
      const prev = counts.get(m.modifierId);
      if (prev) prev.qty += 1;
      else counts.set(m.modifierId, { label: m.label, priceEachDa: price, qty: 1 });
    }
    const modifierSelections: PosModifierCartSelection[] = [...counts.entries()].map(([modifierId, v]) => ({
      modifierId,
      label: v.label,
      priceEachDa: v.priceEachDa,
      quantity: v.qty,
    }));
    const removedRaw = it.removedIngredients;
    const removedIngredientLabels: string[] = Array.isArray(removedRaw)
      ? removedRaw.filter((x): x is string => typeof x === "string")
      : [];
    const line = recalcLine({
      id: it.id,
      menuItemId: it.menuItemId,
      name: it.nameSnapshot,
      quantity: it.quantity,
      baseUnitPriceDa: base,
      extrasUnitTotalDa: 0,
      unitPriceDa: 0,
      lineTotalDa: 0,
      modifierSelections,
      removedIngredientIds: [],
      ingredients: [],
      removedIngredientLabels,
      notes: (it.kitchenNotes ?? "").trim(),
      isDraftLine: false,
      kitchenStatus:
        typeof it.kitchenStatus === "string" && it.kitchenStatus.trim() ? it.kitchenStatus.trim() : "PENDING",
    });
    lines.push(line);
  }
  return lines;
}

function parseOrderDetailForHydrate(raw: unknown): {
  orderId: string;
  version: number;
  items: PosOrderHydrateItem[];
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const versionRaw = o.version;
  const version =
    typeof versionRaw === "number"
      ? versionRaw
      : Number.parseInt(typeof versionRaw === "string" ? versionRaw : "1", 10);
  const itemsRaw = o.items;
  if (!id || !Array.isArray(itemsRaw)) return null;
  const safeVersion = Number.isFinite(version) ? version : 1;
  const items: PosOrderHydrateItem[] = [];
  for (const row of itemsRaw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const lid = typeof r.id === "string" ? r.id : "";
    const menuItemId = typeof r.menuItemId === "string" ? r.menuItemId : null;
    const nameSnapshot = typeof r.nameSnapshot === "string" ? r.nameSnapshot : "";
    const quantity = typeof r.quantity === "number" ? r.quantity : Number(r.quantity);
    const unitPrice = typeof r.unitPrice === "string" ? r.unitPrice : "0";
    const kitchenNotes = r.kitchenNotes;
    const kitchenStatus = r.kitchenStatus;
    if (!lid || !menuItemId || !nameSnapshot || !Number.isFinite(quantity) || quantity < 1) continue;
    items.push({
      id: lid,
      menuItemId,
      nameSnapshot,
      quantity,
      unitPrice,
      kitchenNotes: typeof kitchenNotes === "string" || kitchenNotes === null ? (kitchenNotes as string | null) : null,
      kitchenStatus: typeof kitchenStatus === "string" ? kitchenStatus : undefined,
      removedIngredients: r.removedIngredients,
      modifiers: Array.isArray(r.modifiers)
        ? (r.modifiers as Record<string, unknown>[]).map((m) => ({
            modifierId: typeof m.modifierId === "string" ? m.modifierId : null,
            label: typeof m.label === "string" ? m.label : "",
            priceDelta: typeof m.priceDelta === "string" ? m.priceDelta : "0",
          }))
        : [],
    });
  }
  return { orderId: id, version: safeVersion, items };
}

/** Read optimistic-concurrency `version` from an order detail API payload. */
export function extractOrderVersionFromDetail(raw: unknown): number | null {
  const parsed = parseOrderDetailForHydrate(raw);
  return parsed?.version ?? null;
}

function normalizePersistedWaiterName(raw: unknown): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

/** Whether line qty/delete mutations are allowed (paid / closed / cancelled orders are locked). */
export function parseOrderLinesEditable(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return true;
  const o = raw as Record<string, unknown>;
  if (o.closedAt != null) return false;
  const status = o.status;
  if (status === "COMPLETED" || status === "CANCELLED") return false;
  if (o.paymentStatus === "PAID") return false;
  return true;
}

export type PosCartLineDraft = Pick<
  PosCartLine,
  | "menuItemId"
  | "name"
  | "quantity"
  | "baseUnitPriceDa"
  | "modifierSelections"
  | "removedIngredientIds"
  | "ingredients"
  | "notes"
> & { isDraftLine?: boolean; removedIngredientLabels?: string[] };

export type PosOrderStoreState = {
  tableId: string | null;
  tableLabel: string | null;
  activeOrderId: string | null;
  activeOrderVersion: number | null;
  waiterName: string;
  /** Last waiter name persisted on the server (used to skip redundant meta patches). */
  persistedWaiterName: string;
  /** False when the active order is paid, closed, or cancelled. */
  orderLinesEditable: boolean;
  /** Deleted sent lines awaiting kitchen CANCEL dispatch. */
  pendingKitchenRemovalCount: number;
  lines: PosCartLine[];
  setTableContext: (p: { tableId: string | null; tableLabel: string | null }) => void;
  setActiveOrder: (orderId: string | null, version: number | null) => void;
  setWaiterName: (name: string) => void;
  incrementPendingKitchenRemoval: () => void;
  clearSession: () => void;
  hydrateFromOrderDetail: (orderJson: unknown) => void;
  addLine: (line: PosCartLineDraft) => void;
  removeLine: (lineId: string) => void;
  changeQty: (lineId: string, quantity: number) => void;
  incrementQty: (lineId: string) => void;
  decrementQty: (lineId: string) => void;
  setLineNotes: (lineId: string, notes: string) => void;
  addModifierQuantity: (lineId: string, modifierId: string, label: string, priceEachDa: number, delta: number) => void;
  removeModifierQuantity: (lineId: string, modifierId: string, delta: number) => void;
  clearCart: () => void;
  computeTotals: () => { subtotalDa: number; totalDa: number; itemCount: number };
};

const initial: Pick<
  PosOrderStoreState,
  | "tableId"
  | "tableLabel"
  | "activeOrderId"
  | "activeOrderVersion"
  | "waiterName"
  | "persistedWaiterName"
  | "orderLinesEditable"
  | "pendingKitchenRemovalCount"
  | "lines"
> = {
  tableId: null,
  tableLabel: null,
  activeOrderId: null,
  activeOrderVersion: null,
  waiterName: "",
  persistedWaiterName: "",
  orderLinesEditable: true,
  pendingKitchenRemovalCount: 0,
  lines: [],
};

export const usePosOrderStore = create<PosOrderStoreState>((set, get) => ({
  ...initial,

  setTableContext: (p) => set({ tableId: p.tableId, tableLabel: p.tableLabel }),

  setActiveOrder: (orderId, version) => set({ activeOrderId: orderId, activeOrderVersion: version }),

  setWaiterName: (name) => set({ waiterName: name }),

  incrementPendingKitchenRemoval: () =>
    set((s) => ({ pendingKitchenRemovalCount: s.pendingKitchenRemovalCount + 1 })),

  clearSession: () => set({ ...initial }),

  hydrateFromOrderDetail: (orderJson) => {
    const parsed = parseOrderDetailForHydrate(orderJson);
    if (!parsed) return;
    const raw = orderJson as Record<string, unknown>;
    const waiterName = normalizePersistedWaiterName(raw.waiterName);
    const prev = get();
    const pendingKitchenRemovalCount =
      prev.activeOrderId === parsed.orderId ? prev.pendingKitchenRemovalCount : 0;
    set({
      activeOrderId: parsed.orderId,
      activeOrderVersion: parsed.version,
      lines: hydrateItemsToLines(parsed.items),
      waiterName,
      persistedWaiterName: waiterName,
      orderLinesEditable: parseOrderLinesEditable(orderJson),
      pendingKitchenRemovalCount,
    });
  },

  addLine: (line) => {
    const draft: PosCartLine = {
      id: "",
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
      baseUnitPriceDa: line.baseUnitPriceDa,
      extrasUnitTotalDa: 0,
      unitPriceDa: 0,
      lineTotalDa: 0,
      modifierSelections: line.modifierSelections,
      removedIngredientIds: line.removedIngredientIds,
      ingredients: line.ingredients,
      removedIngredientLabels: line.removedIngredientLabels,
      notes: line.notes,
      isDraftLine: line.isDraftLine ?? true,
      kitchenStatus: "PENDING",
    };
    const withId = recalcLine({ ...draft, id: newLineId() });
    set((s) => ({ lines: [...s.lines, withId] }));
  },

  removeLine: (lineId) =>
    set((s) => ({
      lines: s.lines.filter((l) => l.id !== lineId),
    })),

  changeQty: (lineId, quantity) => {
    const q = Math.max(1, Math.min(999, Math.floor(quantity)));
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.id !== lineId) return l;
        return recalcLine({ ...l, quantity: q });
      }),
    }));
  },

  incrementQty: (lineId) => {
    const l = get().lines.find((x) => x.id === lineId);
    if (l?.isDraftLine) get().changeQty(lineId, l.quantity + 1);
  },

  decrementQty: (lineId) => {
    const l = get().lines.find((x) => x.id === lineId);
    if (l?.isDraftLine) get().changeQty(lineId, l.quantity - 1);
  },

  setLineNotes: (lineId, notes) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.id === lineId && (l.isDraftLine || s.orderLinesEditable) ? { ...l, notes } : l,
      ),
    })),

  addModifierQuantity: (lineId, modifierId, label, priceEachDa, delta) => {
    if (delta <= 0) return;
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.id !== lineId || !l.isDraftLine) return l;
        const next = [...l.modifierSelections];
        const idx = next.findIndex((m) => m.modifierId === modifierId);
        if (idx >= 0) {
          const cur = next[idx]!;
          next[idx] = { ...cur, quantity: cur.quantity + delta };
        } else {
          next.push({ modifierId, label, priceEachDa, quantity: delta });
        }
        return recalcLine({ ...l, modifierSelections: next });
      }),
    }));
  },

  removeModifierQuantity: (lineId, modifierId, delta) => {
    if (delta <= 0) return;
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.id !== lineId || !l.isDraftLine) return l;
        const next = l.modifierSelections
          .map((m) => {
            if (m.modifierId !== modifierId) return m;
            const q = Math.max(0, m.quantity - delta);
            return q <= 0 ? null : { ...m, quantity: q };
          })
          .filter((x): x is PosModifierCartSelection => x !== null);
        return recalcLine({ ...l, modifierSelections: next });
      }),
    }));
  },

  clearCart: () => set({ lines: [] }),

  computeTotals: () => {
    const { lines } = get();
    const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
    const subtotalDa = lines.reduce((s, l) => s + l.lineTotalDa, 0);
    return { subtotalDa, totalDa: subtotalDa, itemCount };
  },
}));
