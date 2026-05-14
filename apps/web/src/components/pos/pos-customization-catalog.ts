import type { PosCustomizationTemplate } from "./pos-cart-types";

/** Default pizza customization — aligned with Figma modal (Margherita). */
const PIZZA_STANDARD: PosCustomizationTemplate = {
  ingredients: [
    { id: "fromage", label: "Fromage", defaultOn: true },
    { id: "olive", label: "Olive", defaultOn: true },
    { id: "origan", label: "Origan", defaultOn: true },
  ],
  extras: [
    { id: "extra-fromage", label: "Extra Fromage", priceDeltaDa: 100 },
    { id: "extra-olive", label: "Extra Olive", priceDeltaDa: 50 },
  ],
};

/** Slightly different defaults for vegetarian / 4 fromages demos */
const PIZZA_VEG: PosCustomizationTemplate = {
  ingredients: [
    { id: "fromage", label: "Fromage", defaultOn: true },
    { id: "legumes", label: "Légumes", defaultOn: true },
    { id: "origan", label: "Origan", defaultOn: true },
  ],
  extras: [
    { id: "extra-fromage", label: "Extra Fromage", priceDeltaDa: 100 },
    { id: "extra-olive", label: "Extra Olive", priceDeltaDa: 50 },
  ],
};

const PIZZA_MEAT: PosCustomizationTemplate = {
  ingredients: [
    { id: "fromage", label: "Fromage", defaultOn: true },
    { id: "pepperoni", label: "Pepperoni", defaultOn: true },
    { id: "origan", label: "Origan", defaultOn: true },
  ],
  extras: [
    { id: "extra-fromage", label: "Extra Fromage", priceDeltaDa: 100 },
    { id: "extra-pepperoni", label: "Extra Pepperoni", priceDeltaDa: 120 },
  ],
};

const BY_PRODUCT_ID: Record<string, PosCustomizationTemplate> = {
  "pop-1": PIZZA_STANDARD,
  "pop-2": PIZZA_VEG,
  "pz-1": PIZZA_STANDARD,
  "pz-2": PIZZA_VEG,
  "pz-3": PIZZA_VEG,
  "pz-4": PIZZA_MEAT,
};

export function getCustomizationTemplate(productId: string): PosCustomizationTemplate {
  return BY_PRODUCT_ID[productId] ?? PIZZA_STANDARD;
}
