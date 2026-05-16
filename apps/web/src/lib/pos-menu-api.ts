import type { PosMenuItemModalData } from "@/components/pos/pos-menu-item-modal";
import type { PosProductCardModel } from "@/components/pos/pos-product-models";

export type MenuCategoryApiRow = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  colorToken: string | null;
  iconKey: string | null;
  itemCount: number;
};

export type MenuItemApiRow = {
  id: string;
  name: string;
  description: string;
  basePrice: string;
  available: boolean;
  popular: boolean;
  sortOrder: number;
  category: { id: string; name: string; slug: string; sortOrder: number; colorToken: string | null };
  ingredients: { id: string; name: string; removable: boolean; sortOrder: number }[];
  modifiers: { id: string; name: string; extraPrice: string; sortOrder: number }[];
};

export function parseMenuCategories(raw: unknown): MenuCategoryApiRow[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuCategoryApiRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const name = typeof r.name === "string" ? r.name : "";
    const slug = typeof r.slug === "string" ? r.slug : "";
    const sortOrder = typeof r.sortOrder === "number" ? r.sortOrder : Number(r.sortOrder) || 0;
    const itemCount = typeof r.itemCount === "number" ? r.itemCount : Number(r.itemCount) || 0;
    if (!id || !name) continue;
    out.push({
      id,
      name,
      slug,
      sortOrder,
      colorToken: typeof r.colorToken === "string" || r.colorToken === null ? (r.colorToken as string | null) : null,
      iconKey: typeof r.iconKey === "string" || r.iconKey === null ? (r.iconKey as string | null) : null,
      itemCount,
    });
  }
  return out;
}

export function parseMenuItems(raw: unknown): MenuItemApiRow[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuItemApiRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id : "";
    const name = typeof r.name === "string" ? r.name : "";
    const basePrice = typeof r.basePrice === "string" ? r.basePrice : "0";
    const available = typeof r.available === "boolean" ? r.available : true;
    const popular = typeof r.popular === "boolean" ? r.popular : false;
    const sortOrder = typeof r.sortOrder === "number" ? r.sortOrder : Number(r.sortOrder) || 0;
    const description = typeof r.description === "string" ? r.description : "";
    const catRaw = r.category;
    if (!id || !name || !catRaw || typeof catRaw !== "object") continue;
    const c = catRaw as Record<string, unknown>;
    const cid = typeof c.id === "string" ? c.id : "";
    const cname = typeof c.name === "string" ? c.name : "";
    const cslug = typeof c.slug === "string" ? c.slug : "";
    const csort = typeof c.sortOrder === "number" ? c.sortOrder : Number(c.sortOrder) || 0;
    if (!cid) continue;
    const ingredientsRaw = r.ingredients;
    const ingredients: MenuItemApiRow["ingredients"] = [];
    if (Array.isArray(ingredientsRaw)) {
      for (const ir of ingredientsRaw) {
        if (!ir || typeof ir !== "object") continue;
        const x = ir as Record<string, unknown>;
        const iid = typeof x.id === "string" ? x.id : "";
        const iname = typeof x.name === "string" ? x.name : "";
        const removable = typeof x.removable === "boolean" ? x.removable : true;
        const isort = typeof x.sortOrder === "number" ? x.sortOrder : Number(x.sortOrder) || 0;
        if (iid && iname) ingredients.push({ id: iid, name: iname, removable, sortOrder: isort });
      }
    }
    const modifiersRaw = r.modifiers;
    const modifiers: MenuItemApiRow["modifiers"] = [];
    if (Array.isArray(modifiersRaw)) {
      for (const mr of modifiersRaw) {
        if (!mr || typeof mr !== "object") continue;
        const x = mr as Record<string, unknown>;
        const mid = typeof x.id === "string" ? x.id : "";
        const mname = typeof x.name === "string" ? x.name : "";
        const extraPrice = typeof x.extraPrice === "string" ? x.extraPrice : "0";
        const msort = typeof x.sortOrder === "number" ? x.sortOrder : Number(x.sortOrder) || 0;
        if (mid && mname) modifiers.push({ id: mid, name: mname, extraPrice, sortOrder: msort });
      }
    }
    out.push({
      id,
      name,
      description,
      basePrice,
      available,
      popular,
      sortOrder,
      category: {
        id: cid,
        name: cname,
        slug: cslug,
        sortOrder: csort,
        colorToken: typeof c.colorToken === "string" || c.colorToken === null ? (c.colorToken as string | null) : null,
      },
      ingredients,
      modifiers,
    });
  }
  return out;
}

export function menuItemToProductCard(m: MenuItemApiRow): PosProductCardModel {
  const n = Number.parseFloat(m.basePrice);
  const priceLabel = `${Number.isFinite(n) ? n.toLocaleString("fr-DZ") : "0"} DA`;
  return {
    id: m.id,
    name: m.name,
    priceLabel,
    variant: m.popular ? "popular" : "default",
    showPopularBadge: m.popular,
    available: m.available,
  };
}

function basePriceString(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw != null && typeof raw === "object" && "toString" in raw) {
    return String((raw as { toString: () => string }).toString());
  }
  return "0";
}

/** One `/menu/catalog` response → POS categories + items (single HTTP round-trip). */
export function parseMenuFromCatalog(raw: unknown): {
  categories: MenuCategoryApiRow[];
  items: MenuItemApiRow[];
} {
  if (!Array.isArray(raw)) return { categories: [], items: [] };
  const categories: MenuCategoryApiRow[] = [];
  const items: MenuItemApiRow[] = [];

  for (const catRow of raw) {
    if (!catRow || typeof catRow !== "object") continue;
    const c = catRow as Record<string, unknown>;
    const cid = typeof c.id === "string" ? c.id : "";
    const cname = typeof c.name === "string" ? c.name : "";
    const cslug = typeof c.slug === "string" ? c.slug : "";
    const csort = typeof c.sortOrder === "number" ? c.sortOrder : Number(c.sortOrder) || 0;
    if (!cid || !cname) continue;

    const itemsRaw = c.items;
    const catItems: unknown[] = Array.isArray(itemsRaw) ? itemsRaw : [];
    const categoryMeta = {
      id: cid,
      name: cname,
      slug: cslug,
      sortOrder: csort,
      colorToken:
        typeof c.colorToken === "string" || c.colorToken === null ? (c.colorToken as string | null) : null,
    };

    categories.push({
      id: cid,
      name: cname,
      slug: cslug,
      sortOrder: csort,
      colorToken: categoryMeta.colorToken,
      iconKey: typeof c.iconKey === "string" || c.iconKey === null ? (c.iconKey as string | null) : null,
      itemCount: catItems.length,
    });

    for (const itemRow of catItems) {
      if (!itemRow || typeof itemRow !== "object") continue;
      const r = itemRow as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : "";
      const name = typeof r.name === "string" ? r.name : "";
      if (!id || !name) continue;

      const ingredientsRaw = r.ingredients;
      const ingredients: MenuItemApiRow["ingredients"] = [];
      if (Array.isArray(ingredientsRaw)) {
        for (const ir of ingredientsRaw) {
          if (!ir || typeof ir !== "object") continue;
          const x = ir as Record<string, unknown>;
          const iid = typeof x.id === "string" ? x.id : "";
          const iname = typeof x.name === "string" ? x.name : "";
          const removable = typeof x.removable === "boolean" ? x.removable : true;
          const isort = typeof x.sortOrder === "number" ? x.sortOrder : Number(x.sortOrder) || 0;
          if (iid && iname) ingredients.push({ id: iid, name: iname, removable, sortOrder: isort });
        }
      }

      const modifiersRaw = r.modifiers;
      const modifiers: MenuItemApiRow["modifiers"] = [];
      if (Array.isArray(modifiersRaw)) {
        for (const mr of modifiersRaw) {
          if (!mr || typeof mr !== "object") continue;
          const x = mr as Record<string, unknown>;
          const mid = typeof x.id === "string" ? x.id : "";
          const mname = typeof x.name === "string" ? x.name : "";
          const extraPrice = basePriceString(x.extraPrice);
          const msort = typeof x.sortOrder === "number" ? x.sortOrder : Number(x.sortOrder) || 0;
          if (mid && mname) modifiers.push({ id: mid, name: mname, extraPrice, sortOrder: msort });
        }
      }

      items.push({
        id,
        name,
        description: typeof r.description === "string" ? r.description : "",
        basePrice: basePriceString(r.basePrice),
        available: typeof r.available === "boolean" ? r.available : true,
        popular: typeof r.popular === "boolean" ? r.popular : false,
        sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : Number(r.sortOrder) || 0,
        category: categoryMeta,
        ingredients,
        modifiers,
      });
    }
  }

  return { categories, items };
}

export function menuItemToModalData(m: MenuItemApiRow): PosMenuItemModalData {
  const base = Math.round(Number.parseFloat(m.basePrice) || 0);
  return {
    id: m.id,
    name: m.name,
    basePriceDa: base,
    ingredients: m.ingredients.map((i) => ({ id: i.id, name: i.name, removable: i.removable })),
    modifiers: m.modifiers.map((x) => ({
      id: x.id,
      name: x.name,
      extraPriceDa: Math.round(Number.parseFloat(x.extraPrice) || 0),
    })),
  };
}
