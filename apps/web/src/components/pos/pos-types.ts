import type { LucideIcon } from "lucide-react";

export interface PosCategory {
  id: string;
  label: string;
  count: number;
  icon: LucideIcon;
}

export type PosProductVariant = "popular" | "default";

export interface PosProduct {
  id: string;
  name: string;
  priceLabel: string;
  variant: PosProductVariant;
  showPopularBadge?: boolean;
}
