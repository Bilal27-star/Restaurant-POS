import { ChevronLeft, Plus, UtensilsCrossed, X } from "lucide-react";
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
import type { PosCartLineItem } from "./pos-cart-types";
import {
  buildCartLinePayload,
  buildIngredientState,
  computeUnitPriceDa,
  formatDa,
  parsePriceLabelDa,
} from "./pos-customization-pricing";
import { getCustomizationTemplate } from "./pos-customization-catalog";
import type { PosProduct } from "./pos-demo-data";
import { PosModalKitchenNoteSection } from "./pos-kitchen-note";

export interface ProductCustomizationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: PosProduct | null;
  /** Controlled kitchen note draft (persisted in parent per product when modal closes). */
  kitchenNotes: string;
  onKitchenNotesChange: (value: string) => void;
  onAddToCart: (line: Omit<PosCartLineItem, "id">) => void;
}

function ToggleChip({
  pressed,
  dimmed,
  onClick,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  pressed: boolean;
  dimmed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={pressed}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "relative min-h-11 touch-manipulation rounded-full border px-4 py-2.5 text-left text-sm font-medium transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        "active:scale-[0.97] motion-reduce:active:scale-100",
        dimmed
          ? "border-white/[0.06] bg-zinc-900/40 text-muted-foreground opacity-45 shadow-none"
          : pressed
            ? "border-violet-400/50 bg-gradient-to-br from-violet-500/25 to-fuchsia-600/15 text-foreground shadow-[0_0_24px_rgba(139,92,246,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
            : "border-white/[0.1] bg-zinc-900/55 text-foreground hover:border-violet-400/35 hover:bg-zinc-800/80 hover:shadow-[0_0_18px_rgba(139,92,246,0.12)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ProductCustomizationModal({
  open,
  onOpenChange,
  product,
  kitchenNotes,
  onKitchenNotesChange,
  onAddToCart,
}: ProductCustomizationModalProps) {
  const template = product ? getCustomizationTemplate(product.id) : null;
  const [ingredientOn, setIngredientOn] = React.useState<Record<string, boolean>>({});
  const [selectedExtraIds, setSelectedExtraIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open || !template) return;
    setIngredientOn(buildIngredientState(template));
    setSelectedExtraIds([]);
  }, [open, product?.id, template]);

  const extraSet = React.useMemo(() => new Set(selectedExtraIds), [selectedExtraIds]);

  const baseDa = product && template ? parsePriceLabelDa(product.priceLabel) : 0;
  const { unitPriceDa, extrasUnitTotalDa } =
    product && template ? computeUnitPriceDa(baseDa, template, extraSet) : { unitPriceDa: 0, extrasUnitTotalDa: 0 };

  const toggleIngredient = (id: string) => {
    setIngredientOn((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExtra = (id: string) => {
    setSelectedExtraIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleAdd = () => {
    if (!product || !template) return;
    const line = buildCartLinePayload(product, template, ingredientOn, extraSet, 1, { notes: kitchenNotes });
    onAddToCart(line);
    onOpenChange(false);
  };

  const canRender = Boolean(product);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        aria-describedby="product-customization-desc"
        className={cn(
          "surface-dark-ink flex max-h-[min(92dvh,720px)] w-[min(100vw-1rem,24rem)] flex-col overflow-hidden p-0 sm:w-[min(100vw-2rem,28rem)]",
          "rounded-2xl border border-violet-500/25 bg-gradient-to-b from-zinc-900/95 via-zinc-950/98 to-[#0b0616] shadow-[0_28px_80px_rgba(0,0,0,0.55),0_0_100px_rgba(139,92,246,0.12)] backdrop-blur-xl",
        )}
      >
        {!canRender || !template ? null : (
          <>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-violet-500/15 bg-gradient-to-r from-violet-950/35 via-transparent to-fuchsia-950/20 px-5 pb-4 pt-5">
              <div className="min-w-0">
                <DialogTitle className="text-xl font-bold tracking-tight text-white">{product!.name}</DialogTitle>
                <p className="mt-1 text-2xl font-bold tabular-nums text-fuchsia-300 drop-shadow-[0_0_14px_rgba(232,121,249,0.35)]">
                  {formatDa(baseDa)}
                </p>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-white/90 transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
                  aria-label="Fermer"
                >
                  <X className="size-5" />
                </button>
              </DialogClose>
            </div>

            <DialogDescription id="product-customization-desc" className="sr-only">
              Personnalisez les ingrédients, suppléments et note cuisine, puis ajoutez au panier.
            </DialogDescription>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <section aria-labelledby="ing-heading">
                <div id="ing-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UtensilsCrossed className="size-4 text-violet-300" aria-hidden />
                  <span>
                    Ingrédients <span className="text-muted-foreground">({template!.ingredients.length})</span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {template!.ingredients.map((ing) => {
                    const on = Boolean(ingredientOn[ing.id]);
                    return (
                      <ToggleChip
                        key={ing.id}
                        pressed={on}
                        dimmed={!on}
                        aria-label={`${ing.label}, ${on ? "inclus" : "retiré"}`}
                        onClick={() => toggleIngredient(ing.id)}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full transition-colors duration-200",
                              on ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" : "bg-zinc-600",
                            )}
                            aria-hidden
                          />
                          {ing.label}
                        </span>
                      </ToggleChip>
                    );
                  })}
                </div>
              </section>

              <section className="mt-8" aria-labelledby="extras-heading">
                <div id="extras-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Plus className="size-4 text-fuchsia-300" aria-hidden />
                  <span>
                    Suppléments <span className="text-muted-foreground">({template!.extras.length})</span>
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {template!.extras.map((ex) => {
                    const selected = selectedExtraIds.includes(ex.id);
                    return (
                      <button
                        key={ex.id}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        aria-label={`${ex.label}, plus ${ex.priceDeltaDa} DA`}
                        onClick={() => toggleExtra(ex.id)}
                        className={cn(
                          "flex min-h-11 w-full min-w-0 touch-manipulation items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:w-auto sm:min-w-[12rem]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
                          "active:scale-[0.98] motion-reduce:active:scale-100",
                          selected
                            ? "border-fuchsia-400/55 bg-gradient-to-r from-fuchsia-600/25 to-violet-600/20 text-foreground shadow-[0_0_28px_rgba(217,70,239,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]"
                            : "border-white/[0.1] bg-zinc-900/50 text-foreground hover:border-fuchsia-400/30 hover:bg-zinc-800/70",
                        )}
                      >
                        <span>{ex.label}</span>
                        <span
                          className={cn(
                            "shrink-0 tabular-nums text-xs font-semibold",
                            selected ? "text-fuchsia-200" : "text-violet-300/80",
                          )}
                        >
                          +{ex.priceDeltaDa} DA
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <PosModalKitchenNoteSection value={kitchenNotes} onChange={onKitchenNotesChange} />
            </div>

            <div className="shrink-0 space-y-2 border-t border-violet-500/15 bg-gradient-to-t from-[#0b0616] via-zinc-950/95 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-12 min-h-12 shrink-0 gap-2 rounded-xl border border-white/[0.08] bg-zinc-800/90 px-4 text-base font-medium text-white hover:bg-zinc-700"
                  onClick={() => onOpenChange(false)}
                >
                  <ChevronLeft className="size-5" aria-hidden />
                  Retour
                </Button>
                <Button
                  type="button"
                  className="relative h-12 min-h-12 flex-1 gap-2 rounded-xl border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] text-base font-semibold text-white shadow-[0_12px_36px_rgba(219,39,119,0.45)] transition-[filter,transform,box-shadow] hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-[0_14px_44px_rgba(236,72,153,0.5)] active:translate-y-px"
                  onClick={handleAdd}
                >
                  <Plus className="size-5" aria-hidden />
                  Ajouter — {formatDa(unitPriceDa)}
                </Button>
              </div>
              {extrasUnitTotalDa > 0 ? (
                <p className="text-center text-xs text-muted-foreground">
                  Base {formatDa(baseDa)} + suppléments {formatDa(extrasUnitTotalDa)}
                </p>
              ) : (
                <p className="text-center text-xs text-muted-foreground/80">Prix mis à jour selon les suppléments</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
