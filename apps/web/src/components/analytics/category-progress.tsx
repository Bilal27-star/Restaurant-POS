import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface CategoryProgressRow {
  id: string;
  name: string;
  percent: number;
  revenueDa: number;
  barFrom: string;
  barTo: string;
}

export interface CategoryProgressProps {
  title?: string;
  rows: readonly CategoryProgressRow[];
  className?: string;
}

function formatDa(n: number): string {
  return `${n.toLocaleString("fr-DZ")} DA`;
}

export function CategoryProgress({ title = "Revenue by Category", rows, className }: CategoryProgressProps) {
  const [barsOn, setBarsOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsOn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-white/[0.08] bg-[#111827] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_16px_48px_-24px_rgba(0,0,0,0.55)] md:p-5",
        className,
      )}
    >
      <h2 className="border-b border-white/[0.06] pb-4 text-base font-semibold tracking-tight text-white md:text-lg">{title}</h2>
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((row) => (
          <li key={row.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-semibold text-slate-100">{row.name}</span>
              <span className="shrink-0 tabular-nums text-sm font-semibold text-white">{row.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-white/[0.06]">
              <div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-out motion-reduce:transition-none",
                  row.barFrom,
                  row.barTo,
                )}
                style={{ width: barsOn ? `${row.percent}%` : "0%" }}
              />
            </div>
            <p className="text-right text-xs font-semibold tabular-nums text-slate-300">{formatDa(row.revenueDa)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
