import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDa } from "@/components/pos/pos-customization-pricing";
import { cn } from "@/lib/utils";
import type { Shift } from "./caisse-financial-types";
import type { ShiftDrawerMetrics } from "./caisse-store";

export interface CaisseShiftSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift | null;
  metrics: ShiftDrawerMetrics | null;
}

export function CaisseShiftSummaryModal({ open, onOpenChange, shift, metrics }: CaisseShiftSummaryModalProps) {
  const diff = shift?.cashDifferenceDa ?? 0;
  const diffClass =
    Math.abs(diff) <= 500 ? "text-emerald-700" : Math.abs(diff) <= 2500 ? "text-amber-700" : "text-red-700";

  return (
    <Dialog open={open && !!shift && !!metrics} onOpenChange={onOpenChange}>
      {shift && metrics ? (
        <DialogContent className="duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none">
          <DialogHeader>
            <DialogTitle>Récapitulatif de shift</DialogTitle>
            <DialogDescription>
              Shift clôturé · {shift.cashierName} ·{" "}
              {shift.closedAtMs ? new Date(shift.closedAtMs).toLocaleString("fr-DZ") : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="Ventes totales" value={formatDa(metrics.totalSalesDa)} />
              <Metric label="Espèces" value={formatDa(metrics.cashSalesDa)} accent="text-orange-600" />
              <Metric label="Carte" value={formatDa(metrics.cardSalesDa)} accent="text-sky-600" />
              <Metric label="À emporter" value={formatDa(metrics.takeawayRevenueDa)} accent="text-violet-600" />
              <Metric label="Dépenses" value={formatDa(metrics.expensesDa)} accent="text-amber-700" />
              <Metric label="Remboursements" value={formatDa(metrics.refundsDa)} accent="text-red-600" />
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Fond initial</dt>
                  <dd className="text-lg font-bold tabular-nums">{formatDa(shift.openingCashDa)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tiroir attendu</dt>
                  <dd className="text-lg font-bold tabular-nums text-primary">{formatDa(shift.expectedCashDa ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Compté</dt>
                  <dd className="text-lg font-bold tabular-nums">{formatDa(shift.closingCountedCashDa ?? 0)}</dd>
                </div>
              </dl>
              <div className="mt-4 border-t border-border pt-3 text-center">
                <p className="text-xs text-muted-foreground">Écart final</p>
                <p className={cn("text-2xl font-bold tabular-nums", diffClass)}>
                  {diff >= 0 ? "+" : ""}
                  {diff.toLocaleString("fr-DZ")} DA
                </p>
              </div>
              {shift.closeNotes ? (
                <p className="mt-3 rounded-lg bg-muted/60 p-2 text-sm text-muted-foreground">{shift.closeNotes}</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-bold tabular-nums text-foreground", accent)}>{value}</p>
    </div>
  );
}
