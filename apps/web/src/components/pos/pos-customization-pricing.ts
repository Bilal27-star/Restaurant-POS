import type {
  PosCartExtraLine,
  PosCartIngredientLine,
  PosCartLineItem,
  PosCustomizationTemplate,
} from "./pos-cart-types";
import type { PosProduct } from "./pos-types";

export function parsePriceLabelDa(label: string): number {
  const compact = label.replace(/\s/g, "").replace(/,/g, "");
  const m = compact.match(/^(\d+)/);
  return m ? Number.parseInt(m[1]!, 10) : 0;
}

export function formatDa(amount: number): string {
  const n = Math.max(0, Math.round(amount));
  return `${n.toLocaleString("fr-DZ")} DA`;
}

export function buildIngredientState(template: PosCustomizationTemplate): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const ing of template.ingredients) {
    next[ing.id] = ing.defaultOn;
  }
  return next;
}

export function computeExtrasTotalDa(template: PosCustomizationTemplate, selectedExtraIds: ReadonlySet<string>): number {
  let sum = 0;
  for (const ex of template.extras) {
    if (selectedExtraIds.has(ex.id)) sum += ex.priceDeltaDa;
  }
  return sum;
}

export function computeUnitPriceDa(
  baseUnitPriceDa: number,
  template: PosCustomizationTemplate,
  selectedExtraIds: ReadonlySet<string>,
): { extrasUnitTotalDa: number; unitPriceDa: number } {
  const extrasUnitTotalDa = computeExtrasTotalDa(template, selectedExtraIds);
  return {
    extrasUnitTotalDa,
    unitPriceDa: baseUnitPriceDa + extrasUnitTotalDa,
  };
}

export function buildCartIngredientSnapshot(
  template: PosCustomizationTemplate,
  ingredientOn: Record<string, boolean>,
): PosCartIngredientLine[] {
  return template.ingredients.map((ing) => ({
    id: ing.id,
    label: ing.label,
    included: Boolean(ingredientOn[ing.id]),
  }));
}

export function buildCartExtrasSnapshot(
  template: PosCustomizationTemplate,
  selectedExtraIds: ReadonlySet<string>,
): PosCartExtraLine[] {
  return template.extras
    .filter((ex) => selectedExtraIds.has(ex.id))
    .map((ex) => ({
      id: ex.id,
      label: ex.label,
      priceEachDa: ex.priceDeltaDa,
    }));
}

export function buildCartLinePayload(
  product: PosProduct,
  template: PosCustomizationTemplate,
  ingredientOn: Record<string, boolean>,
  selectedExtraIds: ReadonlySet<string>,
  quantity = 1,
  options?: { notes?: string },
): Omit<PosCartLineItem, "id"> {
  const baseUnitPriceDa = parsePriceLabelDa(product.priceLabel);
  const { extrasUnitTotalDa, unitPriceDa } = computeUnitPriceDa(baseUnitPriceDa, template, selectedExtraIds);
  return {
    productId: product.id,
    name: product.name,
    quantity,
    baseUnitPriceDa,
    extrasUnitTotalDa,
    unitPriceDa,
    lineTotalDa: unitPriceDa * quantity,
    ingredients: buildCartIngredientSnapshot(template, ingredientOn),
    extras: buildCartExtrasSnapshot(template, selectedExtraIds),
    notes: (options?.notes ?? "").trim(),
  };
}
