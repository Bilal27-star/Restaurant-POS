/** POS cart + customization snapshots (frontend-only). */

export interface PosCartIngredientLine {
  id: string;
  label: string;
  /** `false` = removed / off for this line item */
  included: boolean;
}

export interface PosCartExtraLine {
  id: string;
  label: string;
  priceEachDa: number;
}

export interface PosCartLineItem {
  id: string;
  productId: string;
  name: string;
  /** When true, quantity / remove controls are disabled (paid, closed, or cancelled order). */
  readOnly?: boolean;
  /** When true, per-line kitchen notes can be edited (draft lines only). */
  notesEditable?: boolean;
  quantity: number;
  /** Base product price in DA (no extras). */
  baseUnitPriceDa: number;
  /** Sum of selected extras per unit in DA. */
  extrasUnitTotalDa: number;
  /** `baseUnitPriceDa + extrasUnitTotalDa` */
  unitPriceDa: number;
  /** `unitPriceDa * quantity` */
  lineTotalDa: number;
  ingredients: PosCartIngredientLine[];
  extras: PosCartExtraLine[];
  /** Free-text instructions for the kitchen (per line item). */
  notes: string;
}

export interface PosIngredientDef {
  id: string;
  label: string;
  /** Default is included / on */
  defaultOn: boolean;
}

export interface PosExtraDef {
  id: string;
  label: string;
  /** Added to base price when selected (DA) */
  priceDeltaDa: number;
}

export interface PosCustomizationTemplate {
  ingredients: PosIngredientDef[];
  extras: PosExtraDef[];
}
