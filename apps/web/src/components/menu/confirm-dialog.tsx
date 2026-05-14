import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

const overlayClass = cn(
  "!bg-black/55 backdrop-blur-md",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200",
);

const panelClass = cn(
  "w-[min(100vw-1.5rem,24rem)] border-pos-border-subtle bg-pos-depth/95 p-0 text-foreground backdrop-blur-xl",
  "shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)] ring-1 ring-black/[0.08]",
);

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={overlayClass} className={cn(panelClass, "gap-0 p-0")}>
        <DialogHeader className="border-b border-pos-border-subtle px-5 pb-4 pt-5">
          <DialogTitle className="text-lg font-semibold text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-sm font-medium text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-between gap-3 border-t border-pos-border-subtle bg-pos-depth/80 px-5 py-4 backdrop-blur-sm">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-pos-border-subtle bg-pos-glass text-foreground hover:bg-secondary"
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className={cn(
              "h-10 rounded-[14px] px-5 font-semibold text-white",
              destructive
                ? "border-0 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500"
                : "border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] hover:from-[#8b5cf6] hover:to-[#ec4899]",
            )}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
