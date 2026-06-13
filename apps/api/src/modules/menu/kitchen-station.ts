import type { KitchenStation } from "@pos/database";

/** Infer kitchen routing from category name (French/English menu labels). */
export function resolveKitchenStationFromCategoryName(categoryName: string): KitchenStation | null {
  const c = categoryName.toLowerCase();

  if (c.includes("pizza")) {
    return "PIZZA";
  }
  if (
    /\b(burger|sandwich|tacos?|snack)\b/.test(c) ||
    c.includes("burger") ||
    c.includes("sandwich") ||
    c.includes("taco")
  ) {
    return "SNACK";
  }
  if (
    /\b(boisson|drink|drinks|jus|coffee|café|cafe|dessert|cafeteria|cafétéria)\b/.test(c)
  ) {
    return "CAFETERIA";
  }
  if (/\b(plat|plats|salade|paella|poisson)\b/.test(c) || c.includes("entrée") || c.includes("entree")) {
    return "PLATS";
  }

  return null;
}

/** Infer kitchen routing from menu item name. */
export function resolveKitchenStationFromItemName(name: string): KitchenStation | null {
  const n = name.toLowerCase();

  if (n.includes("pizza")) {
    return "PIZZA";
  }
  if (/\b(burger|sandwich|tacos?|snack)\b/.test(n)) {
    return "SNACK";
  }
  if (/\b(jus|drink|drinks|coca|cola|coffee|café|cafe|dessert|boisson)\b/.test(n)) {
    return "CAFETERIA";
  }
  if (/\b(salade|paella|poisson|plat|plats|entrée|entree|fish)\b/.test(n)) {
    return "PLATS";
  }

  return null;
}

export function resolveKitchenStation(
  categoryName: string | null | undefined,
  itemName: string,
  categoryKitchenStation?: KitchenStation | null,
): KitchenStation | null {
  if (categoryKitchenStation) {
    return categoryKitchenStation;
  }
  return (
    resolveKitchenStationFromCategoryName(categoryName ?? "") ??
    resolveKitchenStationFromItemName(itemName)
  );
}
