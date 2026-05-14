import { Plus, UtensilsCrossed, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PosProductCardModel } from "./pos-product-models";

export interface PosProductCardProps {
  product: PosProductCardModel;
  onQuickAdd: (product: PosProductCardModel) => void;
  onCustomize: (product: PosProductCardModel) => void;
  className?: string;
}

export function PosProductCard({ product, onQuickAdd, onCustomize, className }: PosProductCardProps) {
  const popular = product.variant === "popular";

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-xl border p-4 shadow-surface-md ring-1 ring-black/[0.025] transition-[box-shadow,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-surface-hover motion-reduce:hover:translate-y-0",
        popular
          ? "border-orange-500/35 bg-orange-950/35 text-orange-100 ring-orange-500/20 hover:border-orange-400/50"
          : "border-border bg-card hover:border-zinc-600/80",
        className,
      )}
    >
      {product.showPopularBadge ? (
        <div
          className={cn(
            "absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md",
            popular
              ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/30"
              : "bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/25",
          )}
          aria-hidden
        >
          <Zap className="h-4 w-4" />
        </div>
      ) : null}

      <h3 className="pr-10 text-base font-semibold tracking-tight text-foreground">{product.name}</h3>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums tracking-tight",
          popular ? "text-orange-300" : "text-violet-300",
        )}
      >
        {product.priceLabel}
      </p>

      <div className="mt-auto flex gap-2 pt-4">
        <Button
          type="button"
          disabled={product.available === false}
          className={cn(
            "h-10 min-h-10 flex-1 gap-2 rounded-lg font-semibold text-white shadow-surface-sm",
            popular
              ? "border-0 bg-gradient-to-r from-[#ea580c] to-[#f59e0b] shadow-orange-900/15 hover:from-[#f97316] hover:to-[#fbbf24] hover:shadow-surface-md"
              : "border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] shadow-indigo-900/15 hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-surface-md",
          )}
          onClick={() => onQuickAdd(product)}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Ajouter
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={product.available === false}
          className={cn(
            "h-10 min-h-10 w-11 shrink-0 rounded-lg border-pos-border-subtle bg-pos-glass text-muted-foreground shadow-surface-xs transition-[box-shadow,background-color,color] hover:bg-secondary hover:shadow-surface-sm hover:text-foreground",
            popular && "border-pos-neon-orange/30",
          )}
          aria-label="Personnaliser le plat"
          onClick={() => onCustomize(product)}
        >
          <UtensilsCrossed className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}
