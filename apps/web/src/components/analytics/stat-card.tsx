import type { LucideIcon } from "lucide-react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  growth: string;
  /** Icon container — solid SaaS accent, no page-background gradient */
  iconClass: string;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, growth, iconClass, className }: StatCardProps) {
  const positive = growth.trim().startsWith("+") || growth.includes("vs");
  const isNegative = growth.trim().startsWith("−") || growth.trim().startsWith("-");

  return (
    <article
      className={cn(
        "group flex flex-col rounded-2xl border border-white/[0.08] bg-[#111827] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_40px_-20px_rgba(0,0,0,0.55)]",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-white/[0.12] hover:shadow-[0_16px_48px_-18px_rgba(0,0,0,0.6)]",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/[0.08]",
            "transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100",
            iconClass,
          )}
        >
          <Icon className="size-5 text-white" aria-hidden />
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1",
            isNegative
              ? "bg-rose-500/15 text-rose-200 ring-rose-400/30"
              : positive
                ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                : "bg-slate-600/40 text-slate-200 ring-slate-500/35",
          )}
        >
          <TrendingUp className={cn("size-3", isNegative && "rotate-180")} aria-hidden />
          {growth}
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums tracking-tight text-white md:text-[1.65rem]">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-200">{label}</p>
    </article>
  );
}
