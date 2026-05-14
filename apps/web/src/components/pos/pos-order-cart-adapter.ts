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

export function cartLinesToOrderApiLines(lines: PosCartLine[]): {
  menuItemId: string;
  quantity: number;
  modifierIds: string[];
  removedIngredientIds: string[];
  kitchenNotes: string | null;
}[] {
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
