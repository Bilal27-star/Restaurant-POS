import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { parseDaInput } from "./caisse-amount-utils";
import type { CaisseEmployee } from "./caisse-financial-types";

export interface CaisseRefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: CaisseEmployee[];
  onSubmit: (input: { amountDa: number; notes: string; attributedEmployeeId?: string }) => void | Promise<void>;
}

export function CaisseRefundModal({ open, onOpenChange, employees, onSubmit }: CaisseRefundModalProps) {
  const [amountRaw, setAmountRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAmountRaw("");
    setNotes("");
    setEmployeeId("");
  };

  const handleSubmit = async () => {
    const amountDa = parseDaInput(amountRaw);
    if (!amountDa || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ amountDa, notes, attributedEmployeeId: employeeId || undefined });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none">
        <DialogHeader>
          <DialogTitle>Remboursement</DialogTitle>
          <DialogDescription>Montant retiré du tiroir-caisse pour ce shift.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Montant (DA)</label>
            <Input
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              placeholder="ex. 1200"
              inputMode="numeric"
              className="h-11 font-mono tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Traité par</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={cn(
                "flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Motif</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="flex min-h-[4rem] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={!parseDaInput(amountRaw) || submitting}
          >
            {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            {submitting ? "Enregistrement…" : "Enregistrer le remboursement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
