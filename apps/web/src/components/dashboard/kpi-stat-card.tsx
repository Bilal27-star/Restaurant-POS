import { TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { KpiAccent } from "./dashboard-types";

export interface KpiStatCardProps {
  accent: KpiAccent;
  icon: LucideIcon;
  value: string;
  label: string;
  hint: string;
  delta?: string;
  deltaPositive?: boolean;
  badge?: string;
  className?: string;
}

const ACCENT_STYLES: Record<
  KpiAccent,
  {
    shell: string;
    washA: string;
    washB: string;
    iconWrap: string;
    value: string;
  }
> = {
  pink: {
    shell:
      "border-white/[0.07] bg-gradient-to-br from-[rgba(36,22,40,0.92)] via-[rgba(18,14,24,0.88)] to-[rgba(10,8,16,0.92)] shadow-[0_20px_44px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.07)]",
    washA:
      "bg-[radial-gradient(ellipse_85%_70%_at_80%_-15%,rgba(236,72,153,0.14),transparent_58%)]",
    washB:
      "bg-[radial-gradient(ellipse_55%_50%_at_0%_100%,rgba(139,92,246,0.08),transparent_62%)]",
    iconWrap:
      "bg-gradient-to-br from-fuchsia-600/45 to-pink-600/30 text-pink-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_rgba(236,72,153,0.18)] ring-white/[0.1]",
    value:
      "text-pink-300 drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]",
  },
  blue: {
    shell:
      "border-white/[0.07] bg-gradient-to-br from-[rgba(22,28,44,0.92)] via-[rgba(14,16,28,0.88)] to-[rgba(8,10,18,0.92)] shadow-[0_20px_44px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.07)]",
    washA:
      "bg-[radial-gradient(ellipse_80%_65%_at_90%_10%,rgba(59,130,246,0.13),transparent_58%)]",
    washB:
      "bg-[radial-gradient(ellipse_50%_45%_at_10%_95%,rgba(56,189,248,0.07),transparent_62%)]",
    iconWrap:
      "bg-gradient-to-br from-sky-600/45 to-blue-700/35 text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_18px_rgba(56,189,248,0.16)] ring-white/[0.1]",
    value:
      "text-sky-300 drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]",
  },
  orange: {
    shell:
      "border-white/[0.07] bg-gradient-to-br from-[rgba(38,28,22,0.92)] via-[rgba(22,16,14,0.88)] to-[rgba(10,8,12,0.92)] shadow-[0_20px_44px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.07)]",
    washA:
      "bg-[radial-gradient(ellipse_82%_68%_at_75%_0%,rgba(249,115,22,0.12),transparent_58%)]",
    washB:
      "bg-[radial-gradient(ellipse_48%_42%_at_15%_100%,rgba(251,191,36,0.06),transparent_60%)]",
    iconWrap:
      "bg-gradient-to-br from-orange-500/45 to-amber-600/32 text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_18px_rgba(251,146,60,0.15)] ring-white/[0.1]",
    value:
      "text-orange-300 drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]",
  },
  magenta: {
    shell:
      "border-white/[0.07] bg-gradient-to-br from-[rgba(36,20,36,0.92)] via-[rgba(20,12,24,0.88)] to-[rgba(10,7,14,0.92)] shadow-[0_20px_44px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.07)]",
    washA:
      "bg-[radial-gradient(ellipse_78%_62%_at_50%_-10%,rgba(217,70,239,0.12),transparent_58%)]",
    washB:
      "bg-[radial-gradient(ellipse_52%_48%_at_100%_100%,rgba(244,63,94,0.09),transparent_60%)]",
    iconWrap:
      "bg-gradient-to-br from-fuchsia-600/42 to-rose-600/38 text-fuchsia-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_18px_rgba(217,70,239,0.16)] ring-white/[0.1]",
    value:
      "text-fuchsia-300 drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]",
  },
};

export const KpiStatCard = memo(function KpiStatCard({
  accent,
  icon: Icon,
  value,
  label,
  hint,
  delta,
  deltaPositive = true,
  badge,
  className,
}: KpiStatCardProps) {
  const a = ACCENT_STYLES[accent];
  const isPercentDelta = delta?.includes("%") ?? false;
  const deltaDown = delta != null && !deltaPositive && !isPercentDelta;

  return (
    <article
      className={cn(
        "surface-dark-ink group/kpi relative flex flex-col overflow-hidden rounded-2xl border p-5 backdrop-blur-md transition-[transform,box-shadow,border-color] duration-300 motion-reduce:transition-none",
        a.shell,
        "hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 hover:border-white/[0.12] hover:shadow-[0_24px_52px_rgba(0,0,0,0.58)]",
        className,
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0", a.washA)} aria-hidden />
      <div className={cn("pointer-events-none absolute inset-0", a.washB)} aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.12] to-transparent"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover/kpi:scale-[1.02] motion-reduce:group-hover/kpi:scale-100",
            a.iconWrap,
          )}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {delta ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 backdrop-blur-sm transition-colors duration-200",
                deltaPositive
                  ? "bg-emerald-500/18 text-emerald-100 ring-emerald-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : deltaDown
                    ? "bg-rose-500/18 text-rose-100 ring-rose-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "bg-sky-500/15 text-sky-100 ring-sky-400/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
              )}
            >
              {isPercentDelta ? (
                <TrendingUp className={cn("h-3 w-3", !deltaPositive && "rotate-180")} aria-hidden />
              ) : null}
              {delta}
            </span>
          ) : null}
          {badge ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/18 px-2 py-0.5 text-xs font-semibold text-rose-100 ring-1 ring-rose-400/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      <p className={cn("relative mt-6 text-3xl font-bold tabular-nums tracking-tight md:text-4xl", a.value)}>{value}</p>
      <p className="relative mt-1 text-sm font-semibold text-foreground">{label}</p>
      <p className="relative mt-0.5 text-xs font-medium leading-relaxed text-muted-foreground">{hint}</p>
    </article>
  );
});
