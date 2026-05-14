import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useMenuCatalogQuery } from "@/hooks/use-menu-catalog-query";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";

export type TableAddLineInput = {
  menuItemId: string;
  quantity: number;
};

type CatalogCategory = { id: string; name: string; items: { id: string; name: string; priceLabel: string }[] };

function parseCatalog(raw: unknown): CatalogCategory[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogCategory[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const id = String(o.id ?? "");
    const name = String(o.name ?? "");
    const itemsRaw = o.items;
    const items: CatalogCategory["items"] = [];
    if (Array.isArray(itemsRaw)) {
      for (const it of itemsRaw) {
        if (!it || typeof it !== "object") continue;
        const x = it as Record<string, unknown>;
        const iid = String(x.id ?? "");
        const n = String(x.name ?? "");
        if (!iid || !n) continue;
        const bp = x.basePrice;
        const num =
          typeof bp === "string"
            ? Number.parseFloat(bp)
            : typeof bp === "object" && bp !== null && "toString" in bp
              ? Number.parseFloat(String((bp as { toString: () => string }).toString()))
              : 0;
        const priceLabel = `${Number.isFinite(num) ? num.toLocaleString("fr-DZ") : "0"} DA`;
        items.push({ id: iid, name: n, priceLabel });
      }
    }
    if (id && name) out.push({ id, name, items });
  }
  return out;
}

export interface TableAddItemsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableLabel: string;
  onSubmitLines: (lines: TableAddLineInput[]) => Promise<void>;
}

export function TableAddItemsSheet({ open, onOpenChange, tableLabel, onSubmitLines }: TableAddItemsSheetProps) {
  const { data: catalogRaw, isLoading, isError } = useMenuCatalogQuery(open);
  const categories = useMemo(() => parseCatalog(catalogRaw), [catalogRaw]);
  const [catId, setCatId] = useState("");
  const [cart, setCart] = useState<Record<string, { menuItemId: string; name: string; qty: number }>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCart({});
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!catId && categories[0]) setCatId(categories[0].id);
  }, [catId, categories]);

  const active = categories.find((c) => c.id === catId) ?? categories[0];
  const cartLines = Object.values(cart);
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);

  const bump = (menuItemId: string, name: string, delta: number) => {
    setCart((prev) => {
      const cur = prev[menuItemId];
      const nextQty = (cur?.qty ?? 0) + delta;
      if (nextQty <= 0) {
        const { [menuItemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [menuItemId]: { menuItemId, name, qty: nextQty } };
    });
  };

  const handleConfirm = async () => {
    const lines = cartLines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.qty }));
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      await onSubmitLines(lines);
      setCart({});
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const overlayClass = cn(
    "!bg-black/55 backdrop-blur-md",
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200",
  );

  const sheetClass = cn(
    "flex h-full min-h-0 w-full flex-col gap-0 overflow-hidden border-l border-pos-border-subtle bg-pos-depth/98 p-0 shadow-surface-lg backdrop-blur-xl",
    "!max-w-[min(100vw,52rem)] sm:!max-w-[min(100vw,52rem)]",
    "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:slide-out-to-right-8 data-[state=open]:slide-in-from-right-8",
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" hideClose overlayClassName={overlayClass} className={sheetClass}>
        <header className="shrink-0 border-b border-pos-border-subtle bg-pos-depth/90 px-4 py-4 md:px-6">
          <SheetTitle className="text-left text-lg font-bold tracking-tight text-foreground md:text-xl">
            {fr.tableAddSheet.title(tableLabel)}
          </SheetTitle>
          <SheetDescription className="mt-1 text-left text-sm font-medium text-muted-foreground">
            {fr.tableAddSheet.descLive}
          </SheetDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isError ? (
            <p className="p-4 text-sm text-destructive">
              {fr.tableAddSheet.catalogError}
            </p>
          ) : null}
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">{fr.tableAddSheet.catalogLoading}</p>
          ) : (
            <>
              <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-pos-border-subtle px-3 py-2">
                {categories.map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    size="sm"
                    variant={c.id === (active?.id ?? "") ? "default" : "outline"}
                    className="shrink-0 rounded-lg"
                    onClick={() => setCatId(c.id)}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
              <div className="scrollbar-pos-modal min-h-0 flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(active?.items ?? []).map((it) => {
                    const q = cart[it.id]?.qty ?? 0;
                    return (
                      <div
                        key={it.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-pos-border-subtle bg-pos-glass/40 px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{it.name}</p>
                          <p className="text-xs text-muted-foreground">{it.priceLabel}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => bump(it.id, it.name, -1)} aria-label="Moins">
                            <Minus className="size-4" />
                          </Button>
                          <span className="w-6 text-center text-sm font-bold tabular-nums">{q}</span>
                          <Button type="button" size="icon" variant="outline" className="size-8" onClick={() => bump(it.id, it.name, 1)} aria-label="Plus">
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <footer className="shrink-0 border-t border-pos-border-subtle bg-gradient-to-t from-pos-depth via-pos-depth/95 to-pos-depth/80 px-4 py-4 backdrop-blur-md md:px-6">
          <div className="mb-3 flex max-h-24 flex-col gap-1 overflow-y-auto text-xs">
            {cartLines.length === 0 ? (
              <p className="text-center font-medium text-muted-foreground">{fr.tableAddSheet.cartEmpty}</p>
            ) : (
              cartLines.map((l) => (
                <div key={l.menuItemId} className="flex justify-between gap-2 font-medium text-foreground">
                  <span className="truncate">
                    {l.qty}× {l.name}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <ShoppingBag className="size-4" aria-hidden />
              {fr.tableAddSheet.cartLine(cartCount, "")}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {fr.tableAddSheet.cancel}
              </Button>
              <Button type="button" disabled={cartCount === 0 || submitting} onClick={() => void handleConfirm()}>
                {submitting ? "…" : fr.tableAddSheet.addToOrder}
              </Button>
            </div>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
