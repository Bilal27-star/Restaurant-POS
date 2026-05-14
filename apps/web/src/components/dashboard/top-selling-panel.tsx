import { BarChart2, TrendingUp } from "lucide-react";
import { memo } from "react";
import { fr } from "@/lib/locale/fr";
import type { TopSellingItem } from "./dashboard-types";
import { DashboardPanel } from "./dashboard-panel";

export interface TopSellingPanelProps {
  items: TopSellingItem[];
  className?: string;
}

export const TopSellingPanel = memo(function TopSellingPanel({ items, className }: TopSellingPanelProps) {
  return (
    <DashboardPanel
      className={className}
      title={fr.dashboard.topSelling}
      icon={BarChart2}
      headerAccent="blue"
      action={
        <span className="rounded-full border border-pos-border-subtle bg-pos-glass px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
          {fr.common.today}
        </span>
      }
      contentClassName="divide-y divide-white/[0.06] px-2 pb-2 pt-0"
    >
      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm font-medium text-muted-foreground">{fr.dashboard.emptyTopSelling}</p>
      ) : (
        items.map((row) => (
        <div
          key={row.id}
          className="flex items-center gap-3 rounded-lg px-3 py-3.5 transition-colors duration-200 hover:bg-[rgba(34,32,46,0.38)] sm:gap-4"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-pos-border-subtle bg-[rgba(39,39,42,0.35)] text-xs font-bold text-zinc-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            {row.rank}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>{row.sold}</span>
              {row.trendPct ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-300/90">
                    <TrendingUp className="h-3 w-3" aria-hidden />
                    {row.trendPct}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-pos-neon-magenta drop-shadow-[0_0_10px_rgba(219,39,119,0.35)]">
              {row.revenue}
            </p>
            <p className="text-xs text-muted-foreground">{row.avg}</p>
          </div>
        </div>
        ))
      )}
    </DashboardPanel>
  );
});
