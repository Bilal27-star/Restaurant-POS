import { Clock, ShoppingBag, UtensilsCrossed, Wallet } from "lucide-react";
import { KpiStatCard } from "@/components/dashboard/kpi-stat-card";
import type { KpiConfig, RecentOrder, TopSellingItem } from "@/components/dashboard/dashboard-types";
import { formatDashboardCurrency, formatDashboardNumber } from "@/components/dashboard/format-dashboard-currency";
import { RecentOrdersPanel } from "@/components/dashboard/recent-orders-panel";
import { SalesRevenueChart } from "@/components/dashboard/sales-revenue-chart";
import { TopSellingPanel } from "@/components/dashboard/top-selling-panel";
import { Button } from "@/components/ui/button";
import { useAnalyticsDashboard } from "@/hooks/use-analytics-dashboard";
import { fr } from "@/lib/locale/fr";

function timeAgoFr(iso: string): string {
  const d = new Date(iso).getTime();
  const diffMin = Math.floor((Date.now() - d) / 60_000);
  if (diffMin < 1) return fr.dashboard.timeAgoLessThan1;
  if (diffMin < 60) return fr.dashboard.timeAgoMin(diffMin);
  const h = Math.floor(diffMin / 60);
  return fr.dashboard.timeAgoHours(h);
}

function orderStatusVariant(status: string): RecentOrder["statusVariant"] {
  if (status === "READY") return "ready";
  if (status === "PENDING" || status === "PREPARING") return "preparing";
  return "default";
}

function orderStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return fr.dashboard.statusPreparing;
    case "PREPARING":
      return fr.dashboard.statusPreparing;
    case "READY":
      return fr.dashboard.statusReady;
    case "COMPLETED":
      return fr.dashboard.statusPaid;
    default:
      return status;
  }
}

function buildHeadline(o: {
  orderNumber: string;
  type: string;
  tableNumber: string | null;
  waiterName: string | null;
}): string {
  if (o.type === "TAKEAWAY") {
    return fr.dashboard.headlineTakeaway(o.orderNumber, o.waiterName?.trim() || "—");
  }
  if (o.tableNumber) {
    return `#${o.orderNumber} · ${fr.common.table} ${o.tableNumber}${o.waiterName ? ` · ${o.waiterName}` : ""}`;
  }
  return `#${o.orderNumber}${o.waiterName ? ` · ${o.waiterName}` : ""}`;
}

/** Enterprise dashboard — live PostgreSQL metrics (restaurant timezone). */
export function DashboardPage() {
  const q = useAnalyticsDashboard();

  if (q.isLoading) {
    return (
      <div className="relative isolate min-h-0 space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl border border-white/[0.06] bg-[rgba(18,18,24,0.55)]"
            />
          ))}
        </section>
        <div className="h-[22rem] animate-pulse rounded-2xl border border-white/[0.06] bg-[rgba(18,18,24,0.45)] xl:h-[32rem]" />
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="h-80 animate-pulse rounded-2xl border border-white/[0.06] bg-[rgba(18,18,24,0.45)]" />
          <div className="h-80 animate-pulse rounded-2xl border border-white/[0.06] bg-[rgba(18,18,24,0.45)]" />
        </section>
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-2xl border border-white/[0.08] bg-[rgba(12,12,18,0.6)] p-10 text-center">
        <p className="text-sm font-medium text-muted-foreground">{fr.dashboard.dashboardLoadError}</p>
        <Button type="button" variant="outline" className="rounded-xl" onClick={() => void q.refetch()}>
          {fr.dashboard.retry}
        </Button>
      </div>
    );
  }

  const d = q.data;
  const currency = d.currencyCode;

  const kpis: KpiConfig[] = [
    {
      id: "revenue",
      accent: "pink",
      icon: Wallet,
      value: formatDashboardCurrency(d.today.revenue, currency),
      label: fr.dashboard.kpiRevenue,
      hint: fr.dashboard.kpiRevenueHint,
    },
    {
      id: "orders",
      accent: "blue",
      icon: ShoppingBag,
      value: formatDashboardNumber(d.today.ordersOpened),
      label: fr.dashboard.kpiOrders,
      hint: fr.dashboard.kpiOrdersHint,
    },
    {
      id: "tables",
      accent: "orange",
      icon: UtensilsCrossed,
      value: formatDashboardNumber(d.today.activeTables),
      label: fr.dashboard.kpiTables,
      hint: fr.dashboard.kpiTablesHint,
    },
    {
      id: "pending",
      accent: "magenta",
      icon: Clock,
      value: formatDashboardNumber(d.today.openOrders),
      label: fr.dashboard.kpiPending,
      hint: fr.dashboard.kpiPendingHint,
      badge: d.today.pendingPayments > 0 ? formatDashboardNumber(d.today.pendingPayments) : undefined,
    },
  ];

  const topItems: TopSellingItem[] = d.topItems.map((it, idx) => ({
    id: it.menuItemId ?? `${it.name}-${idx}`,
    rank: `#${idx + 1}`,
    name: it.name,
    sold: fr.dashboard.sold(String(it.quantity)),
    revenue: formatDashboardCurrency(it.revenue, currency),
    avg:
      it.quantity > 0
        ? `${formatDashboardCurrency((Number.parseFloat(it.revenue) / it.quantity).toFixed(2), currency)} ${fr.dashboard.avgPerOrder}`
        : "—",
  }));

  const recent: RecentOrder[] = d.recentOrders.map((o) => ({
    id: o.id,
    headline: buildHeadline(o),
    timeAgo: timeAgoFr(o.openedAt),
    amount: formatDashboardCurrency(o.total, currency),
    status: orderStatusLabel(o.status),
    statusVariant: orderStatusVariant(o.status),
  }));

  return (
    <div className="relative isolate min-h-0">
      <div className="relative space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <KpiStatCard
              key={k.id}
              accent={k.accent}
              icon={k.icon}
              value={k.value}
              label={k.label}
              hint={k.hint}
              delta={k.delta}
              deltaPositive={k.deltaPositive}
              badge={k.badge}
            />
          ))}
        </section>

        <section>
          <SalesRevenueChart
            className="min-h-[20rem] xl:min-h-[32rem]"
            currencyCode={currency}
            hourly={d.hourlyToday}
            peakRevenueHourLocal={d.peak.topRevenueHourLocal}
            completedPayments={d.today.completedPayments}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <TopSellingPanel items={topItems} />
          <RecentOrdersPanel orders={recent} />
        </section>
      </div>
    </div>
  );
}
