import type { LucideIcon } from "lucide-react";
import {
  Apple,
  Beef,
  Candy,
  ChefHat,
  Croissant,
  Drumstick,
  Fish,
  GlassWater,
  Hamburger,
  IceCream,
  Martini,
  Milk,
  Pizza,
  Sandwich,
  Soup,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";

export interface PosCategory {
  id: string;
  label: string;
  count: number;
  icon: LucideIcon;
}

export const POS_CATEGORIES: PosCategory[] = [
  { id: "pizza", label: "Pizza", count: 4, icon: Pizza },
  { id: "burgers", label: "Burgers", count: 5, icon: Hamburger },
  { id: "pates", label: "Pâtes", count: 5, icon: Wheat },
  { id: "viandes-rouges", label: "Viandes Rouges", count: 3, icon: Beef },
  { id: "viandes-blanches", label: "Viandes Blanches", count: 0, icon: Drumstick },
  { id: "poisson", label: "Poisson", count: 0, icon: Fish },
  { id: "cocktails", label: "Cocktails", count: 3, icon: Martini },
  { id: "desserts", label: "Desserts", count: 3, icon: IceCream },
  { id: "boissons", label: "Boissons", count: 3, icon: GlassWater },
  { id: "entrees", label: "Entrées", count: 0, icon: ChefHat },
  { id: "soupes", label: "Soupes", count: 0, icon: Soup },
  { id: "sandwichs", label: "Sandwichs", count: 0, icon: Sandwich },
  { id: "tacos", label: "Tacos", count: 0, icon: UtensilsCrossed },
  { id: "snacks", label: "Snacks", count: 0, icon: Candy },
  { id: "bourak", label: "Bourak", count: 0, icon: Croissant },
  { id: "milkshakes", label: "Milkshakes", count: 0, icon: Milk },
  { id: "jus", label: "Jus", count: 0, icon: Apple },
];

export type PosProductVariant = "popular" | "default";

export interface PosProduct {
  id: string;
  name: string;
  priceLabel: string;
  variant: PosProductVariant;
  /** Optional corner badge (e.g. spicy / popular lightning in Figma) */
  showPopularBadge?: boolean;
}

export const POS_POPULAR_PRODUCTS: PosProduct[] = [
  { id: "pop-1", name: "Margherita", priceLabel: "450 DA", variant: "popular", showPopularBadge: true },
  { id: "pop-2", name: "4 Fromages", priceLabel: "800 DA", variant: "popular", showPopularBadge: true },
];

export const POS_PIZZA_PRODUCTS: PosProduct[] = [
  { id: "pz-1", name: "Margherita", priceLabel: "450 DA", variant: "default", showPopularBadge: true },
  { id: "pz-2", name: "Végétarienne", priceLabel: "550 DA", variant: "default" },
  { id: "pz-3", name: "4 Fromages", priceLabel: "800 DA", variant: "default", showPopularBadge: true },
  { id: "pz-4", name: "Pepperoni", priceLabel: "650 DA", variant: "default" },
];
