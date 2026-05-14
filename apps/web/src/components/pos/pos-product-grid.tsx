import { Pizza, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PosProductCardModel } from "./pos-product-models";
import { PosProductCard } from "./pos-product-card";

export interface PosProductGridProps {
  popular: PosProductCardModel[];
  categoryTitle: string;
  categoryCount: number;
  products: PosProductCardModel[];
  onQuickAdd: (product: PosProductCardModel) => void;
  onCustomize: (product: PosProductCardModel) => void;
  className?: string;
}

export function PosProductGrid({
  popular,
  categoryTitle,
  categoryCount,
  products,
  onQuickAdd,
  onCustomize,
  className,
}: PosProductGridProps) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5", className)}>
      <div className="mx-auto max-w-[960px] xl:max-w-none">
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-pos-neon-amber" aria-hidden />
            <h2 className="text-lg font-semibold tracking-tight text-pos-neon-amber">Populaires</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
            {popular.map((p) => (
              <PosProductCard
                key={p.id}
                product={p}
                onQuickAdd={onQuickAdd}
                onCustomize={onCustomize}
                className="min-h-[134px]"
              />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-baseline gap-2">
            <div className="flex items-center gap-2">
              <Pizza className="h-7 w-7 text-pos-neon-magenta" aria-hidden />
              <h2 className="text-xl font-bold tracking-tight text-pos-neon-magenta md:text-2xl">{categoryTitle}</h2>
            </div>
            <span className="text-base font-medium text-muted-foreground">({categoryCount})</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
            {products.map((p) => (
              <PosProductCard
                key={p.id}
                product={p}
                onQuickAdd={onQuickAdd}
                onCustomize={onCustomize}
                className="min-h-[148px]"
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
