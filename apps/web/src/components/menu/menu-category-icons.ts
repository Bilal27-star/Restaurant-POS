import type { LucideIcon } from "lucide-react";
import {
  Beef,
  CircleDot,
  Cookie,
  CupSoda,
  Flame,
  IceCream,
  LayoutGrid,
  Pizza,
  Salad,
  Sandwich,
  UtensilsCrossed,
  Wine,
} from "lucide-react";
import type { CategoryIconId } from "./menu-types";

/** Lucide icons for menu categories — shared by admin rail and legacy sidebar. */
export const MENU_CATEGORY_ICONS: Record<CategoryIconId, LucideIcon> = {
  pizza: Pizza,
  burger: Flame,
  pasta: UtensilsCrossed,
  meat: Beef,
  cocktail: Wine,
  dessert: IceCream,
  drink: CupSoda,
  starter: Salad,
  sandwich: Sandwich,
  taco: CircleDot,
  snack: Cookie,
  default: LayoutGrid,
};

export function getMenuCategoryLucideIcon(iconId: CategoryIconId): LucideIcon {
  return MENU_CATEGORY_ICONS[iconId] ?? MENU_CATEGORY_ICONS.default;
}
