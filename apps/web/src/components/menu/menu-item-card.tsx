import { Pencil, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import type { MenuItem } from "./menu-types";
import { AvailabilityToggle } from "./availability-toggle";

export interface MenuItemCardProps {
  item: MenuItem;
  onEdit: () => void;
  onDelete: () => void;
  onAvailabilityChange: (available: boolean) => void;
  className?: string;
}

function formatDa(n: number): string {
  return `${n.toLocaleString("fr-DZ")} DA`;
}

export function MenuItemCard({ item, onEdit, onDelete, onAvailabilityChange, className }: MenuItemCardProps) {
  const popular = item.popular;

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-xl border p-4 shadow-surface-md ring-1 ring-black/[0.025] transition-[box-shadow,border-color,transform,opacity] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-surface-hover motion-reduce:hover:translate-y-0",
        popular
          ? "border-orange-500/35 bg-orange-950/35 text-orange-100 ring-orange-500/20 hover:border-orange-400/50"
          : "border-border bg-card hover:border-zinc-600/80",
        !item.available && "opacity-75 saturate-[0.88]",
        className,
      )}
    >
      {item.popular ? (
        <div
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/30"
          aria-hidden
        >
          <Zap className="h-4 w-4" />
        </div>
      ) : null}

      <h3 className="pr-10 text-base font-semibold tracking-tight text-foreground">{item.name}</h3>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tabular-nums tracking-tight",
          popular ? "text-orange-300" : "text-violet-300",
        )}
      >
        {formatDa(item.priceDa)}
      </p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        {fr.menuItemCard.ingredientsLine(item.ingredients.length, item.modifiers.length)}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <Button
          type="button"
          className="h-10 min-h-10 flex-1 gap-2 rounded-lg border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] font-semibold text-white shadow-indigo-900/15 hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-surface-md"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4 shrink-0" aria-hidden />
          {fr.menuItemCard.edit}
        </Button>
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="sr-only">{fr.menuItemCard.availableSr}</span>
          <AvailabilityToggle available={item.available} onChange={onAvailabilityChange} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "h-10 min-h-10 w-11 shrink-0 rounded-lg border-pos-border-subtle bg-pos-glass text-muted-foreground shadow-surface-xs transition-[box-shadow,background-color,color,border-color] hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-100 hover:shadow-surface-sm",
            popular && "border-pos-neon-orange/25",
          )}
          aria-label={fr.menuItemCard.deleteAria}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </article>
  );
}
