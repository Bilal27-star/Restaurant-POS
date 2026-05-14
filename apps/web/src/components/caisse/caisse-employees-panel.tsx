import { Plus, TrendingUp } from "lucide-react";
import { formatDa } from "@/components/pos/pos-customization-pricing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CaisseEmployee } from "./caisse-financial-types";

export interface CaisseEmployeesPanelProps {
  employees: CaisseEmployee[];
  shiftTotalSalesDa: number;
  onAddEmployee?: () => void;
}

const statusLabel: Record<CaisseEmployee["status"], string> = {
  active: "En service",
  break: "Pause",
  off: "Hors shift",
};

const statusClass: Record<CaisseEmployee["status"], string> = {
  active: "bg-emerald-500/12 text-emerald-200 ring-1 ring-emerald-500/25",
  break: "bg-amber-500/12 text-amber-100 ring-1 ring-amber-500/25",
  off: "bg-muted/80 text-muted-foreground ring-1 ring-border",
};

export function CaisseEmployeesPanel({ employees, shiftTotalSalesDa, onAddEmployee }: CaisseEmployeesPanelProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-surface-md ring-1 ring-black/[0.025] transition-shadow duration-200 hover:shadow-surface-hover">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-sm font-bold tracking-tight text-foreground">Équipe caisse</h2>
          <TrendingUp className="size-4 shrink-0 text-primary" aria-hidden />
        </div>
        {onAddEmployee ? (
          <Button
            type="button"
            size="sm"
            onClick={onAddEmployee}
            className="h-8 shrink-0 gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 text-xs font-semibold text-white shadow-[0_4px_20px_-8px_rgba(139,92,246,0.5)] hover:from-violet-500 hover:to-fuchsia-500"
          >
            <Plus className="size-3.5" aria-hidden />
            + Add Employee
          </Button>
        ) : null}
      </div>
      <ul className="mt-3 space-y-3">
        {employees.map((e) => {
          const contribution = Math.round(shiftTotalSalesDa * e.contributionWeight);
          return (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5 shadow-surface-xs transition-[box-shadow,background-color] duration-200 hover:bg-muted/50 hover:shadow-surface-sm"
            >
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-surface-sm",
                  e.avatarGradient,
                )}
              >
                {e.avatarInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-foreground">{e.name}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                      statusClass[e.status],
                    )}
                  >
                    {statusLabel[e.status]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{e.role}</p>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground">Perf. shift</span>
                  <span className="font-bold tabular-nums text-orange-600">{e.performanceScore}/100</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500"
                    style={{ width: `${e.performanceScore}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Contribution ventes</span>
                  <span className="font-semibold tabular-nums text-violet-600">{formatDa(contribution)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
