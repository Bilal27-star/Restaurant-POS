import { Banknote, CircleDollarSign, ShoppingCart, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { CategoryProgress, type CategoryProgressRow } from "@/components/analytics/category-progress";
import { InsightCard, type InsightRow } from "@/components/analytics/insight-card";
import { RevenueChart } from "@/components/analytics/revenue-chart";
import { StatCard } from "@/components/analytics/stat-card";
import { formatDa } from "@/components/pos/pos-customization-pricing";
import {
  useAnalyticsOverviewQuery,
  useAnalyticsRevenueQuery,
  useAnalyticsTablesQuery,
} from "@/hooks/use-analytics-queries";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import type { AnalyticsOverviewDto, AnalyticsTablesDto } from "@/types/analytics-dto";

export type AnalyticsPeriod = "today" | "week" | "month" | "custom";

const PERIODS: { id: AnalyticsPeriod; label: string }[] = [
  { id: "today", label: fr.analyticsPage.periodToday },
  { id: "week", label: fr.analyticsPage.periodWeek },
  { id: "month", label: fr.analyticsPage.periodMonth },
  { id: "custom", label: fr.analyticsPage.periodCustom },
];

const KPI_TREND_PLACEHOLDER = "—";

const CATEGORY_BAR_PAIRS: readonly [string, string][] = [
  ["from-violet-500", "to-fuchsia-500"],
  ["from-sky-500", "to-cyan-500"],
  ["from-emerald-500", "to-teal-500"],
  ["from-amber-500", "to-orange-500"],
  ["from-rose-500", "to-pink-500"],
  ["from-indigo-500", "to-violet-500"],
  ["from-cyan-500", "to-blue-500"],
  ["from-lime-500", "to-green-500"],
];

function orderTypeLabel(type: string): string {
  if (type === "DINE_IN") return fr.analyticsPage.orderTypeDineIn;
  if (type === "TAKEAWAY") return fr.analyticsPage.orderTypeTakeaway;
  return type;
}

function toCategoryProgressRows(overview: AnalyticsOverviewDto | undefined): CategoryProgressRow[] {
  if (!overview) return [];
  const entries =
    overview.categoryMix.length > 0
      ? overview.categoryMix.map((c) => ({ name: c.name, revenue: c.revenue }))
      : overview.topItems.slice(0, 6).map((c) => ({ name: c.name, revenue: c.revenue }));
  if (entries.length === 0) return [];
  const values = entries.map((e) => parseFloat(e.revenue));
  const max = Math.max(...values, 1);
  return entries.map((e, i) => {
    const revenueDa = parseFloat(e.revenue);
    const [bf, bt] = CATEGORY_BAR_PAIRS[i % CATEGORY_BAR_PAIRS.length]!;
    return {
      id: `${e.name}-${i}`,
      name: e.name,
      percent: Math.max(6, Math.round((revenueDa / max) * 100)),
      revenueDa,
      barFrom: bf,
      barTo: bt,
    };
  });
}

export function AnalyticsPage() {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("week");

  const { data: overview, isLoading: isOverviewLoading } = useAnalyticsOverviewQuery(period);
  const { data: revenueData } = useAnalyticsRevenueQuery(period, period === "today" ? "hour" : "day");
  const { data: tableMetrics } = useAnalyticsTablesQuery(period);

  const formattedWeeklyRevenue = useMemo(() => {
    if (!revenueData?.points?.length) return [];
    return revenueData.points.map((s) => ({
      day: s.bucketLabel,
      valueDa: parseFloat(s.revenue),
    }));
  }, [revenueData]);

  const categoryMix = useMemo(() => toCategoryProgressRows(overview), [overview]);

  const peakHoursData = useMemo((): InsightRow[] => {
    if (!overview?.peakHoursTop?.length) return [];
    const maxO = Math.max(...overview.peakHoursTop.map((p) => p.ordersOpened), 1);
    return overview.peakHoursTop.map((p) => ({
      label: fr.analyticsPage.peakHourRowLabel(p.hourLocal),
      percent: Math.max(5, Math.round((p.ordersOpened / maxO) * 100)),
    }));
  }, [overview]);

  const orderTypesData = useMemo((): InsightRow[] => {
    if (!overview?.orderTypes?.length) return [];
    const maxO = Math.max(...overview.orderTypes.map((o) => o.orders), 1);
    return overview.orderTypes.map((o) => ({
      label: orderTypeLabel(o.type),
      percent: Math.max(5, Math.round((o.orders / maxO) * 100)),
    }));
  }, [overview]);

  const paymentsData = useMemo((): InsightRow[] => {
    if (!overview?.paymentMethods?.length) return [];
    const totals = overview.paymentMethods.map((p) => parseFloat(p.total));
    const maxT = Math.max(...totals, 1);
    return overview.paymentMethods.map((p) => ({
      label: p.method,
      percent: Math.max(5, Math.round((parseFloat(p.total) / maxT) * 100)),
    }));
  }, [overview]);

  return (
    <div className="space-y-8 md:space-y-10">
      <header className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{fr.analyticsPage.title}</h1>
          <p className="max-w-2xl text-sm font-medium leading-relaxed text-slate-300 md:text-[0.9375rem]">
            {fr.analyticsPage.subtitle}
          </p>
          <p className="text-xs font-semibold text-slate-400">
            {fr.analyticsPage.viewing} {PERIODS.find((p) => p.id === period)?.label ?? period}
          </p>
        </div>
        <div
          className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-[#111827] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          role="tablist"
          aria-label={fr.analyticsPage.periodTabsAria}
        >
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={period === p.id}
              onClick={() => setPeriod(p.id)}
              className={cn(
                "rounded-lg px-3 py-2 text-xs font-semibold transition-[background,color,box-shadow] duration-200 md:px-4 md:text-sm",
                period === p.id
                  ? "bg-slate-700/90 text-white shadow-sm ring-1 ring-white/10"
                  : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <section aria-label="Key performance indicators">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12 xl:gap-4">
          <div className="xl:col-span-3">
            <StatCard
              icon={Banknote}
              label={fr.analyticsPage.kpiWeeklyRevenue}
              value={
                isOverviewLoading ? "…" : overview ? formatDa(parseFloat(overview.revenue)) : "0 DA"
              }
              growth={KPI_TREND_PLACEHOLDER}
              iconClass="bg-emerald-600/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            />
          </div>
          <div className="xl:col-span-3">
            <StatCard
              icon={ShoppingCart}
              label={fr.analyticsPage.kpiTotalOrders}
              value={isOverviewLoading ? "…" : (overview?.ordersCount?.toString() ?? "0")}
              growth={KPI_TREND_PLACEHOLDER}
              iconClass="bg-sky-600/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            />
          </div>
          <div className="xl:col-span-3">
            <StatCard
              icon={CircleDollarSign}
              label={fr.analyticsPage.kpiAov}
              value={
                isOverviewLoading
                  ? "…"
                  : overview?.averageOrderValue
                    ? formatDa(parseFloat(overview.averageOrderValue))
                    : "—"
              }
              growth={KPI_TREND_PLACEHOLDER}
              iconClass="bg-amber-600/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            />
          </div>
          <div className="xl:col-span-3">
            <StatCard
              icon={Users}
              label={fr.analyticsPage.kpiCustomers}
              value={isOverviewLoading ? "…" : (overview?.distinctCustomers?.toString() ?? "0")}
              growth={KPI_TREND_PLACEHOLDER}
              iconClass="bg-violet-600/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
            />
          </div>
        </div>
      </section>

      <section aria-label="Revenue trend and category mix">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-5">
          <div className="min-h-0 xl:col-span-8">
            <RevenueChart title={fr.analyticsPage.chartWeeklyTitle} series={formattedWeeklyRevenue} />
          </div>
          <div className="min-h-0 xl:col-span-4">
            <CategoryProgress title={fr.analyticsPage.categoryMixTitle} rows={categoryMix} />
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-label={fr.analyticsPage.sectionOps}>
        <h2 className="text-lg font-semibold tracking-tight text-white">{fr.analyticsPage.sectionOps}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">
          <div className="lg:col-span-6">
            <InsightCard title={fr.analyticsPage.peakHours} rows={peakHoursData} />
          </div>
          <div className="lg:col-span-6">
            <InsightCard title={fr.analyticsPage.orderTypes} rows={orderTypesData} />
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-label={fr.analyticsPage.sectionPayment}>
        <h2 className="text-lg font-semibold tracking-tight text-white">{fr.analyticsPage.sectionPayment}</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <div className="lg:col-span-6 xl:col-span-5">
            <InsightCard title={fr.analyticsPage.paymentMethods} rows={paymentsData} />
          </div>
        </div>
      </section>

      <section className="space-y-4" aria-label={fr.analyticsPage.sectionPerf}>
        <h2 className="text-lg font-semibold tracking-tight text-white">{fr.analyticsPage.sectionPerf}</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8 xl:col-span-7">
            <PerformanceMetricsCard metrics={tableMetrics} />
          </div>
        </div>
      </section>
    </div>
  );
}

function PerformanceMetricsCard({ metrics }: { metrics?: AnalyticsTablesDto }) {
  const rows = [
    {
      label: fr.analyticsPage.perfTurn,
      value:
        metrics?.completedDineIn?.turnoverPerTableDay != null
          ? `${metrics.completedDineIn.turnoverPerTableDay}x`
          : "—",
      hint: fr.analyticsPage.perfTurnHint,
    },
    {
      label: fr.analyticsPage.perfKitchen,
      value:
        metrics?.completedDineIn?.averageDurationMinutes != null
          ? `${metrics.completedDineIn.averageDurationMinutes} min`
          : "—",
      hint: fr.analyticsPage.perfKitchenHint,
    },
    {
      label: fr.analyticsPage.perfRepeat,
      value: "—",
      hint: fr.analyticsPage.perfRepeatHint,
    },
  ];
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-white/[0.08] bg-[#111827] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_40px_-20px_rgba(0,0,0,0.55)] md:p-5",
        "transition-[box-shadow,border-color] duration-200 hover:border-white/[0.11] hover:shadow-[0_16px_44px_-22px_rgba(0,0,0,0.58)]",
      )}
    >
      <h3 className="border-b border-white/[0.06] pb-3 text-sm font-semibold tracking-tight text-white md:text-base">
        {fr.analyticsPage.perfSnapshotTitle}
      </h3>
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-[#0f172a]/50 px-3 py-3 ring-1 ring-white/[0.04]"
          >
            <div>
              <p className="text-sm font-semibold text-slate-100">{r.label}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-300">{r.hint}</p>
            </div>
            <p className="shrink-0 text-lg font-bold tabular-nums text-white">{r.value}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
