import { Minus, Plus, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PosCartLineDraft } from "@/stores/pos-order-store";
import { formatDa } from "./pos-customization-pricing";
import { PosModalKitchenNoteSection } from "./pos-kitchen-note";

export type PosMenuItemModalData = {
  id: string;
  name: string;
  basePriceDa: number;
  ingredients: { id: string; name: string; removable: boolean }[];
  modifiers: { id: string; name: string; extraPriceDa: number }[];
};

export interface PosMenuItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PosMenuItemModalData | null;
  kitchenNotes: string;
  onKitchenNotesChange: (v: string) => void;
  onAddToCart: (line: PosCartLineDraft) => void;
}

export function PosMenuItemModal({
  open,
  onOpenChange,
  item,
  kitchenNotes,
  onKitchenNotesChange,
  onAddToCart,
}: PosMenuItemModalProps) {
  const [ingOn, setIngOn] = React.useState<Record<string, boolean>>({});
  const [modQty, setModQty] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (!open || !item) return;
    const nextIng: Record<string, boolean> = {};
    for (const ing of item.ingredients) {
      nextIng[ing.id] = true;
    }
    setIngOn(nextIng);
    const mq: Record<string, number> = {};
    for (const m of item.modifiers) mq[m.id] = 0;
    setModQty(mq);
  }, [open, item?.id, item]);

  if (!item) return null;

  const removedIngredientIds = item.ingredients.filter((i) => i.removable && ingOn[i.id] === false).map((i) => i.id);

  const modifierSelections = item.modifiers
    .map((m) => ({
      modifierId: m.id,
      label: m.name,
      priceEachDa: m.extraPriceDa,
      quantity: modQty[m.id] ?? 0,
    }))
    .filter((m) => m.quantity > 0);

  const extrasUnit = modifierSelections.reduce((s, m) => s + m.priceEachDa * m.quantity, 0);
  const unitDa = item.basePriceDa + extrasUnit;

  const bumpMod = (id: string, delta: number) => {
    setModQty((prev) => {
      const cur = prev[id] ?? 0;
      const next = Math.max(0, Math.min(99, cur + delta));
      return { ...prev, [id]: next };
    });
  };

  const handleAdd = () => {
    const ingredients = item.ingredients.map((i) => ({
      id: i.id,
      label: i.name,
      included: i.removable ? Boolean(ingOn[i.id]) : true,
    }));
    onAddToCart({
      menuItemId: item.id,
      name: item.name,
      quantity: 1,
      baseUnitPriceDa: item.basePriceDa,
      modifierSelections,
      removedIngredientIds,
      ingredients,
      notes: kitchenNotes.trim(),
      isDraftLine: true,
    });
    onKitchenNotesChange("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[min(92vh,40rem)] gap-0 overflow-hidden border-pos-border-subtle bg-pos-depth p-0 text-foreground sm:max-w-lg",
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-pos-border-subtle px-5 py-4">
          <div className="min-w-0">
            <DialogTitle className="text-left text-lg font-bold tracking-tight">{item.name}</DialogTitle>
            <DialogDescription className="mt-1 text-left text-sm text-muted-foreground">
              Personnalisez puis ajoutez au panier.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="Fermer">
              <X className="h-5 w-5" />
            </Button>
          </DialogClose>
        </div>

        <div className="scrollbar-pos-modal max-h-[min(72vh,32rem)] overflow-y-auto px-5 py-4">
          {item.ingredients.length > 0 ? (
            <section className="mb-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Ingrédients</p>
              <div className="flex flex-wrap gap-2">
                {item.ingredients.map((ing) => (
                  <button
                    key={ing.id}
                    type="button"
                    disabled={!ing.removable}
                    onClick={() => {
                      if (!ing.removable) return;
                      setIngOn((p) => ({ ...p, [ing.id]: !p[ing.id] }));
                    }}
                    className={cn(
                      "rounded-full border px-3 py-2 text-sm font-medium transition",
                      ingOn[ing.id]
                        ? "border-violet-400/50 bg-violet-500/20 text-foreground"
                        : "border-white/10 bg-zinc-900/60 text-muted-foreground",
                      !ing.removable && "opacity-60",
                    )}
                  >
                    {ing.name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {item.modifiers.length > 0 ? (
            <section className="mb-6">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Extras</p>
              <div className="flex flex-col gap-2">
                {item.modifiers.map((m) => {
                  const q = modQty[m.id] ?? 0;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-zinc-900/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{m.name}</p>
                        <p className="text-xs text-muted-foreground">+{formatDa(m.extraPriceDa)} / u.</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => bumpMod(m.id, -1)}>
                          <Minus className="size-4" />
                        </Button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">{q}</span>
                        <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => bumpMod(m.id, 1)}>
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <PosModalKitchenNoteSection value={kitchenNotes} onChange={onKitchenNotesChange} />
        </div>

        <div className="border-t border-pos-border-subtle bg-pos-depth/95 px-5 py-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Prix unitaire</span>
            <span className="text-lg font-bold tabular-nums text-pos-neon-magenta">{formatDa(Math.round(unitDa))}</span>
          </div>
          <Button
            type="button"
            className="h-12 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-semibold text-white"
            onClick={handleAdd}
          >
            Ajouter au panier
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
