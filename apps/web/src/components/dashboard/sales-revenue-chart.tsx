import { LineChart, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import { DashboardPanel } from "./dashboard-panel";
import { formatDashboardCurrency, formatDashboardNumber } from "./format-dashboard-currency";

export type HourlyRevenuePoint = {
  hourLocal: number;
  revenue: string;
  ordersOpened: number;
};

export interface SalesRevenueChartProps {
  className?: string;
  currencyCode: string;
  hourly: HourlyRevenuePoint[];
  peakRevenueHourLocal: number | null;
  completedPayments: number;
}

function parseAmount(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function SalesRevenueChart({
  className,
  currencyCode,
  hourly,
  peakRevenueHourLocal,
  completedPayments,
}: SalesRevenueChartProps) {
  if (hourly.length === 0) {
    return (
      <DashboardPanel
        className={cn("min-h-[16rem] xl:min-h-0", className)}
        title={fr.dashboard.salesToday}
        icon={LineChart}
        headerAccent="purple"
        contentClassName="p-8 pt-6"
      >
        <p className="text-center text-sm font-medium text-muted-foreground">{fr.dashboard.emptyChart}</p>
      </DashboardPanel>
    );
  }

  const { points, yTicks, peakLabel } = useMemo(() => {
    const vals = hourly.map((h) => parseAmount(h.revenue));
    const maxRaw = Math.max(1, ...vals);
    const maxVal = Math.ceil(maxRaw * 1.08);
    const pts = hourly.map((h, i) => {
      const v = parseAmount(h.revenue);
      const x = 56 + (i * 804) / Math.max(1, hourly.length - 1);
      const y = 20 + (1 - v / maxVal) * 192;
      return { x, y, v, hour: h.hourLocal };
    });
    const yTicks = [0, 0.33, 0.66, 1].map((t) => ({
      y: 20 + t * 192,
      label: formatDashboardCurrency(String((maxVal * (1 - t)).toFixed(2)), currencyCode),
    }));
    const peakLabel =
      peakRevenueHourLocal != null ? fr.dashboard.peakTime(`${peakRevenueHourLocal}h`) : fr.common.peak;
    return { points: pts, yTicks, peakLabel };
  }, [hourly, peakRevenueHourLocal, currencyCode]);

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const fillPoints = `${polyPoints} ${points[points.length - 1]?.x ?? 56},212 ${points[0]?.x ?? 56},212`;

  return (
    <DashboardPanel
      className={cn("min-h-[28rem] xl:min-h-0", className)}
      title={fr.dashboard.salesToday}
      icon={LineChart}
      headerAccent="purple"
      contentClassName="p-5 pt-4"
      action={
        <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-[rgba(12,12,18,0.85)] px-2.5 py-1 font-medium text-amber-100/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm ring-1 ring-amber-400/20">
            <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.35)]" />
            {peakLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-emerald-500/14 px-2 py-1 font-medium text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm ring-1 ring-emerald-400/28">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            {fr.dashboard.completedPaymentsChip(formatDashboardNumber(completedPayments))}
          </span>
        </div>
      }
    >
      <div className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-b from-[rgba(8,8,12,0.96)] via-[rgba(6,6,10,0.98)] to-[rgba(4,4,8,0.99)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_40px_rgba(0,0,0,0.5)]">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_5%,rgba(124,58,237,0.06),transparent_55%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
          aria-hidden
        />
        <svg
          viewBox="0 0 880 260"
          className="relative z-[1] h-auto w-full text-pos-neon-magenta"
          role="img"
          aria-label={fr.dashboard.chartRevenueAria}
        >
          <defs>
            <linearGradient id="dashLineFillLive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ec4899" stopOpacity="0.35" />
              <stop offset="55%" stopColor="#a855f7" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#db2777" stopOpacity="0" />
            </linearGradient>
          </defs>
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1="56" y1={t.y} x2="860" y2={t.y} className="stroke-white/[0.08]" strokeWidth="1" strokeDasharray="4 6" />
              <text x="8" y={t.y + 4} className="fill-zinc-400 text-[11px] font-medium">
                {t.label}
              </text>
            </g>
          ))}
          {hourly.map((_, i) => (
            <line
              key={i}
              x1={56 + (i * 804) / Math.max(1, hourly.length - 1)}
              y1="20"
              x2={56 + (i * 804) / Math.max(1, hourly.length - 1)}
              y2="212"
              className="stroke-white/[0.06]"
              strokeWidth="1"
            />
          ))}
          {polyPoints.length > 0 ? (
            <>
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                className="drop-shadow-[0_0_12px_rgba(236,72,153,0.55)]"
                points={polyPoints}
              />
              <polygon fill="url(#dashLineFillLive)" points={fillPoints} opacity="1" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="4" className="fill-pos-neon-magenta stroke-white/35" strokeWidth="1.25" />
              ))}
            </>
          ) : null}
        </svg>
        <div className="relative z-[1] flex justify-between px-1 pb-1 pt-2 text-[11px] font-medium tabular-nums text-zinc-400 sm:text-xs">
          {hourly.map((h) => (
            <span key={h.hourLocal} className="w-0 flex-1 text-center first:text-left last:text-right">
              {h.hourLocal % 2 === 0 ? `${h.hourLocal}h` : ""}
            </span>
          ))}
        </div>
      </div>
      <div className="relative mt-4 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
        <span className="inline-flex items-center gap-2 rounded-full border border-transparent px-2 py-0.5 transition-colors hover:border-white/[0.08] hover:text-foreground">
          <span className="h-0.5 w-3 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.45)]" />
          {fr.dashboard.chartLegendRevenue(currencyCode)}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-transparent px-2 py-0.5 transition-colors hover:border-white/[0.08] hover:text-foreground">
          <span className="h-0.5 w-3 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.4)]" />
          {fr.dashboard.chartLegendOrders}
        </span>
      </div>
    </DashboardPanel>
  );
}
