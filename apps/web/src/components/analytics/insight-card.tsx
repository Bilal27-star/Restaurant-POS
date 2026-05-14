import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface InsightRow {
  label: string;
  percent: number;
}

export interface InsightCardProps {
  title: string;
  rows: readonly InsightRow[];
  className?: string;
}

export function InsightCard({ title, rows, className }: InsightCardProps) {
  const [barsOn, setBarsOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsOn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-white/[0.08] bg-[#111827] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_40px_-20px_rgba(0,0,0,0.55)] md:p-5",
        "transition-[box-shadow,border-color] duration-200 hover:border-white/[0.11] hover:shadow-[0_16px_44px_-22px_rgba(0,0,0,0.58)]",
        className,
      )}
    >
      <h3 className="border-b border-white/[0.06] pb-3 text-sm font-semibold tracking-tight text-white md:text-base">{title}</h3>
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 font-semibold text-slate-100">{row.label}</span>
              <span className="shrink-0 tabular-nums text-sm font-bold text-white">{row.percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-slate-500/90 to-slate-400/80 transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: barsOn ? `${row.percent}%` : "0%" }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
