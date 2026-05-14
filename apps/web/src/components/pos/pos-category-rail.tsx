import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type PosCategoryTab = { id: string; label: string; count: number; icon: LucideIcon };

export interface PosCategoryRailProps {
  categories: PosCategoryTab[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
}

export function PosCategoryRail({ categories, activeId, onSelect, className, onMoveUp, onMoveDown }: PosCategoryRailProps) {
  return (
    <div
      className={cn(
        "shrink-0 border-pos-border-subtle bg-pos-depth backdrop-blur-md xl:w-48 xl:border-r",
        className,
      )}
    >
      <div className="flex max-h-[11rem] gap-1.5 overflow-x-auto overflow-y-hidden p-3 xl:max-h-none xl:h-full xl:min-h-0 xl:flex-col xl:overflow-y-auto xl:overflow-x-visible">
          {categories.map((cat, idx) => {
            const Icon = cat.icon;
            const active = cat.id === activeId;
            const canMoveUp = !!onMoveUp && idx > 0;
            const canMoveDown = !!onMoveDown && idx < categories.length - 1;

            return (
              <div key={cat.id} className="relative group flex flex-col gap-1 xl:w-full">
                <button
                  type="button"
                  onClick={() => onSelect(cat.id)}
                  className={cn(
                    "flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-pos-neon-magenta/60 w-full",
                    active
                      ? "bg-gradient-to-r from-[#f54900] to-[#e7000b] text-white shadow-[0_10px_24px_rgba(234,88,12,0.35),0_0_0_1px_rgba(255,255,255,0.08)]"
                      : "bg-zinc-800/50 text-muted-foreground hover:bg-zinc-800/80 hover:text-foreground",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{cat.label}</span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums text-xs",
                      active ? "text-white/80" : "text-caption-foreground",
                    )}
                  >
                    {cat.count}
                  </span>
                </button>
                
                {(onMoveUp || onMoveDown) && (
                  <div className="hidden xl:flex absolute -right-2 top-1/2 -translate-y-1/2 flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {onMoveUp && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onMoveUp(cat.id); }}
                        disabled={!canMoveUp}
                        className="p-1 rounded-full bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                      </button>
                    )}
                    {onMoveDown && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onMoveDown(cat.id); }}
                        disabled={!canMoveDown}
                        className="p-1 rounded-full bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
}
