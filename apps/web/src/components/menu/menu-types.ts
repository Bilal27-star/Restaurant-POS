import type { CategoryKitchenStationId } from "./kitchen-station-options";

export type CategoryIconId =
  | "pizza"
  | "burger"
  | "pasta"
  | "meat"
  | "cocktail"
  | "dessert"
  | "drink"
  | "starter"
  | "sandwich"
  | "taco"
  | "snack"
  | "default";

export interface MenuCategory {
  id: string;
  name: string;
  iconId: CategoryIconId;
  iconTint: string;
  kitchenStation: CategoryKitchenStationId;
  description?: string;
}

export interface MenuIngredient {
  id: string;
  name: string;
  removable?: boolean;
}

export interface MenuModifier {
  id: string;
  name: string;
  priceDa: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  priceDa: number;
  available: boolean;
  popular?: boolean;
  image?: string;
  description?: string;
  dietary?: string[];
  allergens?: string[];
  revenue?: number;
  sales?: number;
  cost?: number;
  ingredients: MenuIngredient[];
  modifiers: MenuModifier[];
}

