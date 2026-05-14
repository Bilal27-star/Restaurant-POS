import type { LucideIcon } from "lucide-react";
import {
  Beef,
  CupSoda,
  GlassWater,
  IceCream,
  LayoutGrid,
  Pizza,
  Salad,
  UtensilsCrossed,
  Wine,
} from "lucide-react";

const RULES: { test: RegExp; icon: LucideIcon }[] = [
  { test: /pizza|calzone/i, icon: Pizza },
  { test: /boisson|drink|jus|eau|caf|th|soda|wine|cocktail/i, icon: GlassWater },
  { test: /dessert|glace|baklava|sweet/i, icon: IceCream },
  { test: /viande|meat|grill|merguez|agneau|poulet/i, icon: Beef },
  { test: /entr|starter|salad|salade/i, icon: Salad },
  { test: /plat|main|couscous|poisson|fish/i, icon: UtensilsCrossed },
  { test: /alcool|vin/i, icon: Wine },
  { test: /caf|coffee/i, icon: CupSoda },
];

export function posCategoryIconFromSlug(slug: string, name: string): LucideIcon {
  const blob = `${slug} ${name}`.toLowerCase();
  for (const r of RULES) {
    if (r.test.test(blob)) return r.icon;
  }
  return LayoutGrid;
}
