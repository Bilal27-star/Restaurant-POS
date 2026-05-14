import { Check, Trash2 } from "lucide-react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";

const rowInput = cn(
  "h-11 rounded-xl border border-pos-border-subtle bg-pos-glass/80 text-sm font-medium text-foreground placeholder:text-muted-foreground",
  "shadow-[inset_0_0_0_1px_rgb(129_140_248/0.12)] transition-[border-color,box-shadow] duration-200",
  "focus-visible:border-pos-violet-glow focus-visible:ring-2 focus-visible:ring-pos-neon-magenta/20 focus-visible:ring-offset-0",
);

export interface IngredientInputProps {
  value: string;
  onChange: (name: string) => void;
  removable: boolean;
  onRemovableChange: (removable: boolean) => void;
  onRemove: () => void;
  className?: string;
}

export function IngredientInput({ value, onChange, removable, onRemovableChange, onRemove, className }: IngredientInputProps) {
  const uid = useId();
  const toggleId = `${uid}-removable`;
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3", className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fr.menuIngredientInput.placeholder}
        className={cn(rowInput, "min-w-0 flex-1")}
        aria-label={fr.menuIngredientInput.ariaName}
      />

      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-2.5 rounded-xl border border-pos-border-subtle/80 bg-pos-glass/40 px-3 py-2">
          <span id={`${toggleId}-label`} className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {fr.menuIngredientInput.removable}
          </span>
          <button
            id={toggleId}
            type="button"
            role="checkbox"
            aria-checked={removable}
            aria-labelledby={`${toggleId}-label`}
            onClick={() => onRemovableChange(!removable)}
            className={cn(
              "relative flex size-[22px] shrink-0 items-center justify-center rounded-md border transition-all duration-200",
              removable
                ? "border-transparent bg-gradient-to-br from-[#7c3aed] to-[#db2777] text-white shadow-[0_2px_12px_-2px_rgba(124,58,237,0.45)]"
                : "border-pos-border-subtle bg-pos-depth/80 text-transparent hover:border-zinc-500/50",
            )}
          >
            {removable ? <Check className="size-3.5 stroke-[3]" aria-hidden /> : null}
          </button>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/[0.12] text-rose-200",
            "shadow-sm transition-[background-color,border-color,transform,box-shadow] duration-200 hover:border-rose-400/45 hover:bg-rose-500/20 hover:text-rose-50 active:scale-[0.97]",
          )}
          aria-label={fr.menuIngredientInput.deleteAria}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
