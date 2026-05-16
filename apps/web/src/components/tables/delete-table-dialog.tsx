import { Loader2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import type { RestaurantTable } from "./table-types";

export interface DeleteTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: RestaurantTable | null;
  floorName?: string;
  onConfirm: () => void | Promise<void>;
}

export function DeleteTableDialog({ open, onOpenChange, table, floorName, onConfirm }: DeleteTableDialogProps) {
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const blockWhileBusy = React.useCallback((e: { preventDefault: () => void }) => {
    if (busy) e.preventDefault();
  }, [busy]);

  const handleDelete = async () => {
    if (busy || !table) return;
    setBusy(true);
    try {
      await Promise.resolve(onConfirm());
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const label = table ? `${fr.common.table} ${table.numberLabel}` : fr.deleteTable.thisTable;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        hideClose
        aria-describedby="delete-table-desc"
        onPointerDownOutside={blockWhileBusy}
        onInteractOutside={blockWhileBusy}
        onEscapeKeyDown={blockWhileBusy}
        className="overflow-hidden rounded-2xl border border-red-500/25 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-0 shadow-[0_25px_50px_rgba(0,0,0,0.5),0_0_60px_rgba(239,68,68,0.12)]"
      >
        <div className="border-b border-red-500/15 bg-gradient-to-r from-red-950/35 via-transparent to-violet-950/20 px-5 py-5">
          <DialogTitle className="text-[1.15rem] font-bold leading-7 tracking-tight text-white">
            {fr.deleteTable.title(label)}
          </DialogTitle>
          <DialogDescription id="delete-table-desc" className="mt-2 text-sm text-muted-foreground">
            {floorName ? fr.deleteTable.descWithFloor(floorName) : fr.deleteTable.descFallback}
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              className="h-11 min-h-11 rounded-[10px] border border-white/[0.06] bg-zinc-800 px-6 text-base font-medium text-white hover:bg-zinc-700"
            >
              {fr.deleteTable.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className={cn(
              "h-11 min-h-11 whitespace-nowrap rounded-[10px] border-0 bg-gradient-to-r from-red-600 to-rose-600 px-6 text-base font-semibold text-white shadow-[0_10px_28px_rgba(239,68,68,0.35)] transition-[filter,transform] hover:from-red-500 hover:to-rose-500 active:translate-y-px disabled:opacity-70",
            )}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-[18px] animate-spin" aria-hidden />
                {fr.deleteTable.removing}
              </>
            ) : (
              fr.deleteTable.confirm
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
