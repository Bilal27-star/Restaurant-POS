import { Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PosSearchBarProps {
  className?: string;
  value: string;
  onChange: (v: string) => void;
  filterActiveCount?: number;
}

export function PosSearchBar({ className, value, onChange, filterActiveCount = 0 }: PosSearchBarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3 border-b border-pos-border-subtle bg-pos-depth/40 px-4 py-3 backdrop-blur-md md:px-6",
        className,
      )}
    >
      <div className="relative min-h-11 min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Rechercher un plat…"
          className="h-11 border-pos-border-subtle bg-pos-glass pl-10 text-[15px] text-foreground shadow-[inset_0_0_0_1px_rgb(129_140_248/0.15)] placeholder:text-muted-foreground"
          aria-label="Rechercher un plat"
        />
      </div>
      <button
        type="button"
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-pos-border-subtle bg-pos-glass px-3 text-sm font-medium text-muted-foreground shadow-sm transition hover:border-pos-violet-glow hover:text-foreground"
      >
        <Filter className="h-5 w-5" aria-hidden />
        <span className="tabular-nums text-foreground">{filterActiveCount}</span>
      </button>
    </div>
  );
}
