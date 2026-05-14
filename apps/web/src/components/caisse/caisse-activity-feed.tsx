import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Package,
  Receipt,
  RotateCcw,
  Store,
} from "lucide-react";
import { formatDa } from "@/components/pos/pos-customization-pricing";
import { cn } from "@/lib/utils";
import type { FinancialTransaction } from "./caisse-financial-types";

export interface CaisseActivityFeedProps {
  items: FinancialTransaction[];
  nowMs: number;
}

function iconFor(kind: FinancialTransaction["kind"]) {
  switch (kind) {
    case "sale_cash":
      return Banknote;
    case "sale_card":
      return CreditCard;
    case "takeaway":
      return Package;
    case "refund":
      return RotateCcw;
    case "expense":
      return Receipt;
    case "shift_opened":
      return Store;
    case "shift_closed":
      return ArrowDownLeft;
    default:
      return ArrowUpRight;
  }
}

function toneFor(kind: FinancialTransaction["kind"]) {
  switch (kind) {
    case "sale_cash":
    case "sale_card":
    case "takeaway":
      return "border-emerald-200 bg-emerald-50/80 text-emerald-900";
    case "refund":
    case "expense":
      return "border-red-200 bg-red-50/80 text-red-900";
    case "shift_opened":
      return "border-violet-200 bg-violet-50/80 text-violet-900";
    case "shift_closed":
      return "border-sky-200 bg-sky-50/80 text-sky-900";
    default:
      return "border-border bg-card text-foreground";
  }
}

export function CaisseActivityFeed({ items, nowMs }: CaisseActivityFeedProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-surface-md ring-1 ring-black/[0.025] transition-shadow duration-200 hover:shadow-surface-hover">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-tight text-foreground">Activité récente</h2>
        <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-800">
          Live
        </span>
      </div>
      <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            Aucun mouvement sur ce shift.
          </li>
        ) : (
          items.map((t) => {
            const Icon = iconFor(t.kind);
            const time = new Date(t.createdAtMs).toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" });
            const rel =
              nowMs - t.createdAtMs < 120_000
                ? "À l’instant"
                : nowMs - t.createdAtMs < 3_600_000
                  ? `${Math.floor((nowMs - t.createdAtMs) / 60_000)} min`
                  : time;
            return (
              <li
                key={t.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-[box-shadow,background-color] duration-200 hover:shadow-surface-sm",
                  toneFor(t.kind),
                )}
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/80">
                  <Icon className="size-4 opacity-90" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug text-foreground/95">{t.label}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{rel}</p>
                </div>
                {t.amountDa !== 0 ? (
                  <span
                    className={cn(
                      "shrink-0 text-sm font-bold tabular-nums",
                      t.amountDa < 0 ? "text-red-600" : "text-emerald-700",
                    )}
                  >
                    {t.amountDa > 0 ? "+" : ""}
                    {formatDa(Math.abs(t.amountDa))}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">—</span>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
