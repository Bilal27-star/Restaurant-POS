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
import { Input } from "@/components/ui/input";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";

const inputShell =
  "h-11 min-h-11 rounded-[10px] border bg-zinc-900/50 px-3 text-base text-foreground shadow-none backdrop-blur-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-[color:var(--placeholder-foreground)] focus-visible:border-violet-400/50 focus-visible:ring-2 focus-visible:ring-violet-500/35";

export interface AddFloorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void | Promise<void>;
}

export function AddFloorModal({ open, onOpenChange, onSubmit }: AddFloorModalProps) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setError(null);
      return;
    }
    setName("");
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const blockDismissWhileBusy = React.useCallback((e: { preventDefault: () => void }) => {
    if (submitting) e.preventDefault();
  }, [submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(fr.tables.addRoomErrName);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await Promise.resolve(onSubmit(trimmed));
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const descId = "add-floor-desc";

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent
        hideClose
        aria-describedby={descId}
        onPointerDownOutside={blockDismissWhileBusy}
        onInteractOutside={blockDismissWhileBusy}
        onEscapeKeyDown={blockDismissWhileBusy}
        className="surface-dark-ink overflow-hidden rounded-2xl border border-[rgba(173,70,255,0.3)] bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 p-0 shadow-[0_25px_50px_rgba(0,0,0,0.45),0_0_80px_rgba(139,92,246,0.12)]"
      >
        <form onSubmit={handleSubmit} className="flex flex-col" noValidate>
          <div className="flex items-center justify-between border-b border-violet-500/20 bg-gradient-to-r from-violet-950/40 via-fuchsia-950/25 to-fuchsia-950/20 px-5 py-5">
            <DialogTitle className="text-[1.25rem] font-bold leading-7 tracking-tight text-white">
              {fr.tables.addRoomTitle}
            </DialogTitle>
            <DialogClose asChild>
              <button
                type="button"
                disabled={submitting}
                className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white/90 transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50"
                aria-label={fr.common.close}
              >
                <span className="relative block size-5">
                  <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                  <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
                </span>
              </button>
            </DialogClose>
          </div>
          <DialogDescription id={descId} className="sr-only">
            {fr.tables.addRoomDesc}
          </DialogDescription>
          <div className="flex flex-col gap-4 px-5 pb-2 pt-5">
            <div className="space-y-2">
              <label htmlFor="add-floor-name" className="text-sm font-semibold text-on-dark-label">
                {fr.tables.addRoomName} <span className="text-violet-300">*</span>
              </label>
              <Input
                ref={inputRef}
                id="add-floor-name"
                name="floorName"
                autoComplete="off"
                placeholder={fr.tables.addRoomPlaceholder}
                value={name}
                disabled={submitting}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "add-floor-err" : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                className={cn(
                  inputShell,
                  "border-violet-500/25",
                  error && "border-red-400/55 ring-2 ring-red-500/25 animate-in fade-in duration-200",
                )}
              />
              {error ? (
                <p
                  id="add-floor-err"
                  className="text-sm text-red-300/95 animate-in fade-in slide-in-from-top-1 duration-200"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-2 flex gap-2 border-t border-violet-500/20 bg-gradient-to-r from-violet-950/25 via-transparent to-fuchsia-950/20 px-4 py-4">
            <DialogClose asChild>
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                className="h-11 min-h-11 shrink-0 rounded-[10px] border border-white/[0.06] bg-zinc-800 px-6 text-base font-medium text-white hover:bg-zinc-700"
              >
                {fr.common.cancel}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={submitting}
              className="relative h-11 min-h-11 flex-1 rounded-[10px] border-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 text-base font-semibold text-white shadow-[0_10px_28px_rgba(139,92,246,0.45)] transition-[filter,transform] hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-[0_12px_36px_rgba(167,139,250,0.5)] active:translate-y-px disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-[18px] animate-spin" aria-hidden />
                  {fr.tables.addRoomSaving}
                </>
              ) : (
                fr.tables.addRoomSubmit
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
