import { History } from "lucide-react";
import { memo } from "react";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import type { RecentOrder } from "./dashboard-types";
import { DashboardPanel } from "./dashboard-panel";

export interface RecentOrdersPanelProps {
  orders: RecentOrder[];
  className?: string;
}

export const RecentOrdersPanel = memo(function RecentOrdersPanel({ orders, className }: RecentOrdersPanelProps) {
  return (
    <DashboardPanel
      className={className}
      title={fr.dashboard.recentOrders}
      icon={History}
      headerAccent="pink"
      action={
        <span className="rounded-full border border-pos-border-subtle bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm ring-1 ring-emerald-400/20">
          {fr.dashboard.liveUpdates}
        </span>
      }
      contentClassName="divide-y divide-white/[0.06] px-2 pb-2 pt-0"
    >
      {orders.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm font-medium text-muted-foreground">{fr.dashboard.emptyRecentOrders}</p>
      ) : (
        orders.map((o) => (
        <div
          key={o.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg px-3 py-4 transition-colors duration-200 hover:bg-[rgba(34,32,46,0.38)] sm:flex-nowrap"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{o.headline}</p>
            <p className="mt-1 text-xs text-muted-foreground">{o.timeAgo}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
            <p className="text-sm font-bold tabular-nums text-pos-neon-amber drop-shadow-[0_0_12px_rgba(234,88,12,0.25)]">
              {o.amount}
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                o.statusVariant === "preparing" &&
                  "bg-orange-500/12 text-orange-100 ring-1 ring-orange-400/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm",
                o.statusVariant === "ready" &&
                  "bg-emerald-500/12 text-emerald-100 ring-1 ring-emerald-400/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm",
                o.statusVariant === "default" && "bg-zinc-800/55 text-muted-foreground ring-1 ring-white/[0.06]",
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
              {o.status}
            </span>
          </div>
        </div>
        ))
      )}
    </DashboardPanel>
  );
});
