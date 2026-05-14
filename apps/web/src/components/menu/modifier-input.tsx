import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";

const rowInput = cn(
  "h-11 rounded-xl border border-pos-border-subtle bg-pos-glass/80 text-sm font-medium text-foreground placeholder:text-muted-foreground",
  "shadow-[inset_0_0_0_1px_rgb(129_140_248/0.12)] transition-[border-color,box-shadow] duration-200",
  "focus-visible:border-pos-violet-glow focus-visible:ring-2 focus-visible:ring-pos-neon-magenta/20 focus-visible:ring-offset-0",
);

export interface ModifierInputProps {
  name: string;
  priceRaw: string;
  onNameChange: (name: string) => void;
  onPriceChange: (raw: string) => void;
  onRemove: () => void;
  className?: string;
}

export function ModifierInput({ name, priceRaw, onNameChange, onPriceChange, onRemove, className }: ModifierInputProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-pos-border-subtle/70 bg-pos-depth/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ring-1 ring-black/[0.04] sm:flex-row sm:items-center sm:gap-3",
        className,
      )}
    >
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={fr.menuModifierInput.placeholder}
        className={cn(rowInput, "min-w-0 flex-1")}
        aria-label={fr.menuModifierInput.ariaName}
      />

      <div className="flex shrink-0 items-center justify-end gap-2 sm:w-[9.25rem] sm:justify-end">
        <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">+</span>
        <Input
          value={priceRaw}
          onChange={(e) => onPriceChange(e.target.value.replace(/\D/g, ""))}
          placeholder="0"
          inputMode="numeric"
          className={cn(rowInput, "h-11 w-[5.5rem] shrink-0 text-right font-mono text-sm tabular-nums tracking-tight")}
          aria-label={fr.menuModifierInput.ariaPrice}
        />
        <span className="shrink-0 min-w-[1.5rem] text-left text-xs font-semibold tabular-nums text-muted-foreground">DA</span>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center self-end rounded-xl border border-rose-500/35 bg-rose-500/[0.12] text-rose-200 sm:self-center",
          "shadow-sm transition-[background-color,border-color,transform,box-shadow] duration-200 hover:border-rose-400/50 hover:bg-rose-500/22 hover:text-rose-50 active:scale-[0.96]",
        )}
        aria-label={fr.menuModifierInput.removeAria}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
