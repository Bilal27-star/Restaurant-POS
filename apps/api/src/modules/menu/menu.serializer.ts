import type { Prisma } from "@prisma/client";

import type { MenuCatalogCategory } from "./menu.repository.js";

export type MenuCategorySummaryDto = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  colorToken: string | null;
  iconKey: string | null;
  itemCount: number;
};

export type MenuCategoryRefDto = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  colorToken: string | null;
};

export type MenuIngredientDto = {
  id: string;
  name: string;
  removable: boolean;
  sortOrder: number;
};

export type MenuModifierDto = {
  id: string;
  name: string;
  extraPrice: string;
  sortOrder: number;
};

export type MenuItemPosDto = {
  id: string;
  category: MenuCategoryRefDto;
  name: string;
  description: string;
  basePrice: string;
  available: boolean;
  popular: boolean;
  sortOrder: number;
  imageUrl: string | null;
  ingredients: MenuIngredientDto[];
  modifiers: MenuModifierDto[];
};

function decimalStr(d: Prisma.Decimal): string {
  return d.toFixed(2);
}

function serializeCategoryRef(cat: {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  colorToken: string | null;
}): MenuCategoryRefDto {
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    sortOrder: cat.sortOrder,
    colorToken: cat.colorToken,
  };
}

export function serializeMenuItemFromCatalogRow(
  item: MenuCatalogCategory["items"][number],
  category: MenuCatalogCategory,
): MenuItemPosDto {
  const ingredients: MenuIngredientDto[] = item.ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    removable: i.removable,
    sortOrder: i.sortOrder,
  }));
  const modifiers: MenuModifierDto[] = item.modifiers.map((m) => ({
    id: m.id,
    name: m.name,
    extraPrice: decimalStr(m.extraPrice),
    sortOrder: m.sortOrder,
  }));
  return {
    id: item.id,
    category: serializeCategoryRef(category),
    name: item.name,
    description: item.description,
    basePrice: decimalStr(item.basePrice),
    available: item.available,
    popular: item.popular,
    sortOrder: item.sortOrder,
    imageUrl: item.imageUrl,
    ingredients,
    modifiers,
  };
}

export type MenuItemWithCategoryPayload = Prisma.MenuItemGetPayload<{
  include: {
    category: true;
    ingredients: { orderBy: { sortOrder: "asc" } };
    modifiers: { orderBy: { sortOrder: "asc" } };
  };
}>;

export function serializeMenuItemStandalone(item: MenuItemWithCategoryPayload): MenuItemPosDto {
  const ingredients: MenuIngredientDto[] = item.ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    removable: i.removable,
    sortOrder: i.sortOrder,
  }));
  const modifiers: MenuModifierDto[] = item.modifiers.map((m) => ({
    id: m.id,
    name: m.name,
    extraPrice: decimalStr(m.extraPrice),
    sortOrder: m.sortOrder,
  }));
  return {
    id: item.id,
    category: serializeCategoryRef(item.category),
    name: item.name,
    description: item.description,
    basePrice: decimalStr(item.basePrice),
    available: item.available,
    popular: item.popular,
    sortOrder: item.sortOrder,
    imageUrl: item.imageUrl,
    ingredients,
    modifiers,
  };
}
