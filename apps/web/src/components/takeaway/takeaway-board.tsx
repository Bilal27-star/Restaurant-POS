import type { ReactNode } from "react";
import { CheckCircle2, Clock, Package, ShoppingBag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import type { TakeawayOrder, TakeawayStatusFilter } from "./takeaway-order-types";
import { TakeawayOrderCard } from "./takeaway-order-card";

export interface TakeawayBoardProps {
  nowMs: number;
  query: string;
  onQueryChange: (q: string) => void;
  statusFilter: TakeawayStatusFilter;
  onStatusFilterChange: (f: TakeawayStatusFilter) => void;
  kpis: { pending: number; ready: number; totalToday: number };
  columnNew: TakeawayOrder[];
  columnPreparing: TakeawayOrder[];
  columnReady: TakeawayOrder[];
  columnDelivered: TakeawayOrder[];
  onStartPreparing: (id: string) => void;
  onMarkReady: (id: string) => void;
  onMarkDelivered: (id: string) => void;
  onRequestCancel: (id: string) => void;
}

function ColumnShell({
  title,
  subtitle,
  count,
  icon: Icon,
  accent,
  emptyMessage,
  contentCount,
  children,
}: {
  title: string;
  subtitle?: string;
  count: number;
  icon: typeof Clock;
  accent: "orange" | "emerald" | "sky";
  emptyMessage: string;
  contentCount: number;
  children: ReactNode;
}) {
  const head =
    accent === "orange"
      ? "from-orange-500/20 to-amber-500/10 text-orange-100 border-orange-400/25"
      : accent === "emerald"
        ? "from-emerald-500/20 to-teal-500/10 text-emerald-100 border-emerald-400/25"
        : "from-sky-500/15 to-violet-500/10 text-sky-100 border-sky-400/25";

  return (
    <section className="flex min-h-0 min-w-[min(100%,18rem)] flex-1 flex-col rounded-2xl border border-white/[0.06] bg-purple-950/15 p-3 backdrop-blur-md sm:min-w-[20rem] lg:min-w-0">
      <header
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl border bg-gradient-to-r px-3 py-2.5",
          head,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-5 shrink-0 opacity-90" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-bold leading-tight">{title}</h2>
            {subtitle ? <p className="text-[11px] font-medium text-white/60">{subtitle}</p> : null}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-black/30 px-2 py-0.5 text-xs font-bold tabular-nums">{count}</span>
      </header>
      <div className="mt-3 flex min-h-[12rem] flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
        {contentCount === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.08] py-10 text-center text-sm font-medium text-on-dark-secondary">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function TakeawayBoard({
  nowMs,
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  kpis,
  columnNew,
  columnPreparing,
  columnReady,
  columnDelivered,
  onStartPreparing,
  onMarkReady,
  onMarkDelivered,
  onRequestCancel,
}: TakeawayBoardProps) {
  const filters: { key: TakeawayStatusFilter; label: string }[] = [
    { key: "all", label: fr.takeawayBoard.filterAll },
    { key: "new", label: fr.takeawayBoard.filterNew },
    { key: "preparing", label: fr.takeawayBoard.filterPreparing },
    { key: "ready", label: fr.takeawayBoard.filterReady },
    { key: "delivered", label: fr.takeawayBoard.filterDelivered },
  ];

  const renderCard = (o: TakeawayOrder) => (
    <TakeawayOrderCard
      key={`${o.id}-${o.status}`}
      order={o}
      nowMs={nowMs}
      onStartPreparing={o.status === "PENDING" ? () => onStartPreparing(o.id) : undefined}
      onMarkReady={o.status === "PREPARING" ? () => onMarkReady(o.id) : undefined}
      onMarkDelivered={o.status === "READY" ? () => onMarkDelivered(o.id) : undefined}
      onCancel={() => onRequestCancel(o.id)}
    />
  );

  const pendingCount = columnNew.length + columnPreparing.length;
  const pendingContentCount = pendingCount;

  return (
    <div className="surface-dark-ink flex min-h-0 flex-1 flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-orange-400/25 bg-gradient-to-br from-orange-500/15 to-zinc-900/50 p-4 shadow-[0_0_32px_rgba(251,146,60,0.12)] backdrop-blur-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-orange-500/25 text-orange-200">
            <Clock className="size-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-200/90">{fr.takeawayBoard.kpiPending}</p>
            <p className="text-3xl font-bold tabular-nums text-white">{kpis.pending}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/15 to-zinc-900/50 p-4 shadow-[0_0_32px_rgba(52,211,153,0.12)] backdrop-blur-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/25 text-emerald-200">
            <CheckCircle2 className="size-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200/90">{fr.takeawayBoard.kpiReady}</p>
            <p className="text-3xl font-bold tabular-nums text-white">{kpis.ready}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-600/20 to-zinc-900/50 p-4 shadow-[0_0_32px_rgba(139,92,246,0.15)] backdrop-blur-md">
          <div className="flex size-12 items-center justify-center rounded-xl bg-violet-500/25 text-violet-100">
            <ShoppingBag className="size-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-200/90">{fr.takeawayBoard.kpiTotalToday}</p>
            <p className="text-3xl font-bold tabular-nums text-white">{kpis.totalToday}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={fr.takeawayBoard.searchPlaceholder}
            className="h-11 min-h-11 rounded-xl border-white/[0.08] bg-purple-950/35 text-base text-on-dark-table placeholder:text-on-dark-placeholder backdrop-blur-md"
            aria-label={fr.takeawayBoard.searchAria}
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-purple-950/20 p-1 backdrop-blur-md">
          {filters.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "min-h-9 rounded-lg px-3 text-xs font-semibold touch-manipulation",
                statusFilter === key
                  ? "bg-white/[0.12] text-on-dark-title shadow-inner"
                  : "text-on-dark-secondary hover:bg-white/[0.06] hover:text-on-dark-title",
              )}
              onClick={() => onStatusFilterChange(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-auto pb-2 lg:flex-row lg:overflow-x-visible">
        <div className="flex min-w-0 flex-[1.15] flex-col lg:min-w-0">
          <ColumnShell
            title={fr.takeawayBoard.colQueueTitle}
            subtitle={fr.takeawayBoard.colQueueSubtitle}
            count={pendingCount}
            icon={Clock}
            accent="orange"
            emptyMessage={fr.takeawayBoard.emptyQueue}
            contentCount={pendingContentCount}
          >
            <>
              {columnNew.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-violet-200/80">{fr.takeawayBoard.sectionNew}</p>
                  <div className="flex flex-col gap-3">{columnNew.map(renderCard)}</div>
                </div>
              ) : null}
              {columnPreparing.length ? (
                <div className={cn(columnNew.length ? "mt-4 border-t border-white/[0.06] pt-4" : "")}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-orange-200/90">{fr.takeawayBoard.sectionPreparing}</p>
                  <div className="flex flex-col gap-3">{columnPreparing.map(renderCard)}</div>
                </div>
              ) : null}
            </>
          </ColumnShell>
        </div>

        <div className="flex min-w-0 flex-1 flex-col lg:min-w-0">
          <ColumnShell
            title={fr.takeawayBoard.colReadyTitle}
            count={columnReady.length}
            icon={CheckCircle2}
            accent="emerald"
            emptyMessage={fr.takeawayBoard.emptyReady}
            contentCount={columnReady.length}
          >
            <>{columnReady.map(renderCard)}</>
          </ColumnShell>
        </div>

        <div className="flex min-w-0 flex-1 flex-col lg:min-w-0">
          <ColumnShell
            title={fr.takeawayBoard.colDeliveredTitle}
            subtitle={fr.takeawayBoard.colDeliveredSubtitle}
            count={columnDelivered.length}
            icon={Package}
            accent="sky"
            emptyMessage={fr.takeawayBoard.emptyDelivered}
            contentCount={columnDelivered.length}
          >
            <>{columnDelivered.map(renderCard)}</>
          </ColumnShell>
        </div>
      </div>
    </div>
  );
}
