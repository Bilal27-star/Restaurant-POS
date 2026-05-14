import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDa } from "@/components/pos/pos-customization-pricing";
import { cn } from "@/lib/utils";
import { parseDaInput } from "./caisse-amount-utils";
import type { Shift } from "./caisse-financial-types";
import type { ShiftDrawerMetrics } from "./caisse-store";

export interface CaisseCloseShiftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift;
  metrics: ShiftDrawerMetrics;
  onConfirmClose: (input: { countedCashDa: number; notes: string }) => void;
}

export function CaisseCloseShiftModal({ open, onOpenChange, shift, metrics, onConfirmClose }: CaisseCloseShiftModalProps) {
  const [countedRaw, setCountedRaw] = useState("");
  const [notes, setNotes] = useState("");

  const counted = parseDaInput(countedRaw);
  const diff = counted - metrics.expectedDrawerCashDa;

  const diffTone = useMemo(() => {
    if (!countedRaw.trim()) return "text-muted-foreground";
    if (Math.abs(diff) <= 500) return "text-emerald-700";
    if (Math.abs(diff) <= 2500) return "text-amber-700";
    return "text-red-700";
  }, [countedRaw, diff]);

  const reset = () => {
    setCountedRaw("");
    setNotes("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none">
        <DialogHeader>
          <DialogTitle>Clôture de caisse</DialogTitle>
          <DialogDescription>
            Shift ouvert par <span className="font-medium text-foreground">{shift.cashierName}</span> · comparez le
            comptage physique au tiroir attendu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <section className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Aperçu shift</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Ventes totales</dt>
                <dd className="font-semibold tabular-nums text-foreground">{formatDa(metrics.totalSalesDa)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Espèces</dt>
                <dd className="font-semibold tabular-nums text-orange-600">{formatDa(metrics.cashSalesDa)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Carte</dt>
                <dd className="font-semibold tabular-nums text-sky-600">{formatDa(metrics.cardSalesDa)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">À emporter</dt>
                <dd className="font-semibold tabular-nums text-violet-600">{formatDa(metrics.takeawayRevenueDa)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Dépenses</dt>
                <dd className="font-semibold tabular-nums text-amber-700">{formatDa(metrics.expensesDa)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Remboursements</dt>
                <dd className="font-semibold tabular-nums text-red-600">{formatDa(metrics.refundsDa)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-2 border-t border-border pt-3">
              <div>
                <p className="text-xs text-muted-foreground">Fond de caisse initial</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{formatDa(shift.openingCashDa)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Tiroir attendu</p>
                <p className="text-lg font-bold tabular-nums text-primary">{formatDa(metrics.expectedDrawerCashDa)}</p>
              </div>
            </div>
          </section>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Espèces comptées (réel)</label>
            <Input
              value={countedRaw}
              onChange={(e) => setCountedRaw(e.target.value)}
              placeholder="Montant compté dans le tiroir"
              inputMode="numeric"
              className="h-12 font-mono text-base tabular-nums"
            />
          </div>

          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-center",
              Math.abs(diff) <= 500
                ? "border-emerald-200 bg-emerald-50"
                : Math.abs(diff) <= 2500
                  ? "border-amber-200 bg-amber-50"
                  : "border-red-200 bg-red-50",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">Écart (compté − attendu)</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", diffTone)}>
              {countedRaw.trim() ? `${diff >= 0 ? "+" : ""}${diff.toLocaleString("fr-DZ")} DA` : "—"}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Notes de clôture</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Écarts, incidents, remarques…"
              className="flex min-h-[5rem] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Retour
          </Button>
          <Button
            type="button"
            disabled={!countedRaw.trim()}
            onClick={() => {
              onConfirmClose({ countedCashDa: counted, notes });
              reset();
              onOpenChange(false);
            }}
          >
            Confirmer la clôture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
