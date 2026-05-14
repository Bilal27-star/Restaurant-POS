import { cn } from "@/lib/utils";
import type { MenuCategory } from "./menu-types";
import { getMenuCategoryLucideIcon } from "./menu-category-icons";

export interface CategorySidebarProps {
  categories: MenuCategory[];
  selectedId: string;
  onSelect: (id: string) => void;
  itemCountByCategory: Record<string, number>;
  className?: string;
}

export function CategorySidebar({ categories, selectedId, onSelect, itemCountByCategory, className }: CategorySidebarProps) {
  return (
    <>
      {/* Mobile: horizontal scroll */}
      <div
        className={cn(
          "flex gap-2 overflow-x-auto pb-1 lg:hidden",
          "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15",
          className,
        )}
      >
        {categories.map((c) => (
          <CategoryChip key={c.id} category={c} selected={selectedId === c.id} count={itemCountByCategory[c.id] ?? 0} onSelect={() => onSelect(c.id)} />
        ))}
      </div>

      {/* Desktop: sticky vertical */}
      <aside
        className={cn(
          "hidden max-h-[calc(100dvh-8rem)] w-full shrink-0 overflow-y-auto lg:block lg:w-[17.5rem] lg:pr-2",
          "[scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/12",
          className,
        )}
      >
        <nav className="sticky top-0 flex flex-col gap-1.5" aria-label="Menu categories">
          {categories.map((c) => (
            <CategoryRow key={c.id} category={c} selected={selectedId === c.id} count={itemCountByCategory[c.id] ?? 0} onSelect={() => onSelect(c.id)} />
          ))}
        </nav>
      </aside>
    </>
  );
}

function CategoryChip({
  category,
  selected,
  count,
  onSelect,
}: {
  category: MenuCategory;
  selected: boolean;
  count: number;
  onSelect: () => void;
}) {
  const Icon = getMenuCategoryLucideIcon(category.iconId);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition-all duration-200",
        selected
          ? "border-orange-500/50 bg-gradient-to-r from-orange-600/35 to-rose-600/30 shadow-[0_8px_28px_-12px_rgba(234,88,12,0.35)] ring-1 ring-orange-400/25"
          : "border-white/[0.08] bg-[#111827] hover:border-white/[0.14] hover:bg-[#151f32]",
      )}
    >
      <span className={cn("flex size-9 items-center justify-center rounded-xl ring-1 ring-white/[0.08]", category.iconTint)}>
        <Icon className="size-4 shrink-0" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{category.name}</span>
        <span className="text-xs font-medium text-slate-300">{count} items</span>
      </span>
    </button>
  );
}

function CategoryRow({
  category,
  selected,
  count,
  onSelect,
}: {
  category: MenuCategory;
  selected: boolean;
  count: number;
  onSelect: () => void;
}) {
  const Icon = getMenuCategoryLucideIcon(category.iconId);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/40",
        selected
          ? "border-orange-500/45 bg-gradient-to-r from-orange-600/38 to-rose-600/32 shadow-[0_10px_32px_-14px_rgba(234,88,12,0.38)] ring-1 ring-orange-400/30"
          : "border-white/[0.08] bg-[#111827] hover:border-white/[0.14] hover:bg-[#151f32] hover:shadow-md",
      )}
    >
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/[0.08]", category.iconTint)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-white">{category.name}</span>
        <span className="text-xs font-medium text-slate-300">{count} items</span>
      </span>
    </button>
  );
}
