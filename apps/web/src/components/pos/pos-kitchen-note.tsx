import { NotebookPen } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared glass textarea styling for POS kitchen notes (cart + modal). */
export const POS_KITCHEN_NOTE_TEXTAREA_CLASS = cn(
  "min-h-[4.25rem] w-full resize-y rounded-lg border border-violet-500/25 bg-zinc-950/70 px-3 py-2.5 text-sm font-medium leading-snug text-on-dark-table shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
  "placeholder:text-on-dark-placeholder",
  "transition-[border-color,box-shadow] duration-200",
  "focus-visible:border-violet-400/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
);

export const PosKitchenNoteTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<"textarea">
>(({ className, rows = 3, ...props }, ref) => (
  <textarea ref={ref} rows={rows} {...props} className={cn(POS_KITCHEN_NOTE_TEXTAREA_CLASS, className)} />
));
PosKitchenNoteTextarea.displayName = "PosKitchenNoteTextarea";

export interface PosModalKitchenNoteSectionProps {
  value: string;
  onChange: (next: string) => void;
}

/** Optional kitchen note block for the product customization dialog. */
export function PosModalKitchenNoteSection({ value, onChange }: PosModalKitchenNoteSectionProps) {
  const labelId = React.useId();
  const fieldId = React.useId();
  return (
    <section
      className="mt-8 rounded-xl border border-violet-500/15 bg-zinc-900/45 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
      aria-labelledby={labelId}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-200/90">
        <NotebookPen className="size-4 shrink-0 text-violet-300" aria-hidden />
        <label id={labelId} htmlFor={fieldId}>
          Note cuisine (optionnel)
        </label>
      </div>
      <PosKitchenNoteTextarea
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex. Sans oignons, plus cuit, moins épicé…"
        autoComplete="off"
      />
    </section>
  );
}

export interface PosCartLineKitchenNoteProps {
  notes: string;
  onNotesChange: (next: string) => void;
}

/**
 * Collapsible kitchen-note editor for a cart line.
 * Pair with a read-only preview of `notes` under the product name (parent).
 */
export function PosCartLineKitchenNote({ notes, onNotesChange }: PosCartLineKitchenNoteProps) {
  const [open, setOpen] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      taRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "h-9 min-h-9 gap-1.5 rounded-lg border border-violet-500/20 bg-zinc-900/50 px-2.5 text-xs font-semibold text-violet-100/95 shadow-sm transition-all duration-200",
          "hover:border-violet-400/40 hover:bg-violet-500/10 hover:shadow-[0_0_16px_rgba(139,92,246,0.2)]",
          open && "border-violet-400/50 bg-violet-500/15 shadow-[0_0_18px_rgba(167,139,250,0.25)]",
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <NotebookPen className="size-3.5 shrink-0 opacity-90" aria-hidden />
        Note cuisine
      </Button>
      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <PosKitchenNoteTextarea
            ref={taRef}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Ex. Cuire plus longtemps, sans salade…"
            className="mt-2"
            rows={3}
            tabIndex={open ? 0 : -1}
          />
        </div>
      </div>
    </div>
  );
}
