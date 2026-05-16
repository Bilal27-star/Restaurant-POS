import {
  Banknote,
  Calculator,
  CreditCard,
  Package,
  Printer,
  Receipt,
  RotateCcw,
  Scale,
  Search,
  Store,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDaInput } from "@/components/caisse/caisse-amount-utils";
import { CaisseAddEmployeePanel } from "@/components/caisse/caisse-add-employee-panel";
import { DineInOrderQuickSearch } from "@/components/caisse/dine-in-order-quick-search";
import { CaisseAddExpenseModal } from "@/components/caisse/caisse-add-expense-modal";
import { CaisseCloseShiftModal } from "@/components/caisse/caisse-close-shift-modal";
import { CaisseRefundModal } from "@/components/caisse/caisse-refund-modal";
import { CaisseShiftSummaryModal } from "@/components/caisse/caisse-shift-summary-modal";
import type { FinancialTransaction } from "@/components/caisse/caisse-financial-types";
import { CaisseEmployeesPanel } from "@/components/caisse/caisse-employees-panel";
import {
  computeShiftDrawerMetrics,
  useCaisseStore,
} from "@/components/caisse/caisse-store";
import { useUsersQuery, useUserMutations } from "@/hooks/use-users-queries";
import {
  buildUserCreateBody,
  mapApiUserToCaisseEmployee,
} from "@/lib/users/user-form-utils";
import { formatDa } from "@/components/pos/pos-customization-pricing";
import { useLiveNow } from "@/components/takeaway/use-takeaway-orders";
import {
  useActiveShiftQuery,
  useOpenShiftMutation,
  useCloseShiftMutation,
  useCreateExpenseMutation,
  useShiftRefundMutation,
  useExpenseCategoriesQuery,
} from "@/hooks/use-caisse-queries";
import { PageQueryState } from "@/components/data/page-query-state";
import { PageShell } from "@/components/data/page-shell";
import { usePageRouteDiagnostics } from "@/hooks/use-page-route-diagnostics";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";

function formatShiftDuration(openedAtMs: number, nowMs: number) {
  const m = Math.max(0, Math.floor((nowMs - openedAtMs) / 60_000));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return `${h} h ${r} min`;
}

function detailLabel(t: FinancialTransaction): string {
  const s = t.label.trim();
  if (s.length <= 52) return s;
  return `${s.slice(0, 49)}…`;
}

function orderTypeLabel(t: FinancialTransaction): string {
  if (t.kind === "takeaway") return "À emporter";
  if (t.kind === "expense") return "Dépense";
  if (t.kind === "refund") return "Remboursement";
  if (/table|salle/i.test(t.label)) return "Salle";
  return "Caisse";
}

function paymentLabel(kind: FinancialTransaction["kind"]): string {
  switch (kind) {
    case "sale_cash":
      return "Espèces";
    case "sale_card":
      return "Carte";
    case "takeaway":
      return "À emporter";
    case "refund":
      return "Remboursement";
    case "expense":
      return "Dépense";
    default:
      return "—";
  }
}

function rowStatus(t: FinancialTransaction): { label: string; className: string } {
  switch (t.kind) {
    case "sale_cash":
    case "sale_card":
    case "takeaway":
      return {
        label: "Encaissé",
        className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-200",
      };
    case "refund":
      return {
        label: "Remboursé",
        className: "border-rose-500/35 bg-rose-500/12 text-rose-200",
      };
    case "expense":
      return {
        label: "Sortie",
        className: "border-amber-500/35 bg-amber-500/12 text-amber-200",
      };
    default:
      return { label: "—", className: "border-border bg-muted text-muted-foreground" };
  }
}

const cardSurface = cn(
  "rounded-2xl border border-border bg-card shadow-surface-md ring-1 ring-white/[0.05]",
  "transition-[box-shadow,border-color,transform] duration-200 ease-out",
  "hover:shadow-surface-hover hover:border-zinc-600/80",
);

function KpiCard({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: "cash" | "revenue" | "expense" | "net";
  icon: typeof Banknote;
}) {
  const skin =
    accent === "cash"
      ? {
          bar: "border-l-orange-500",
          value: "text-orange-300",
          iconWrap: "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30",
        }
      : accent === "revenue"
        ? {
            bar: "border-l-emerald-500",
            value: "text-emerald-300",
            iconWrap: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30",
          }
        : accent === "expense"
          ? {
              bar: "border-l-amber-500",
              value: "text-amber-200",
              iconWrap: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30",
            }
          : {
              bar: "border-l-indigo-500",
              value: "text-indigo-300",
              iconWrap: "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30",
            };

  return (
    <div
      className={cn(
        "flex min-h-[9.5rem] flex-col rounded-2xl border border-border border-l-4 bg-card p-5 shadow-surface-md ring-1 ring-white/[0.05] sm:min-h-[10.5rem] sm:p-6",
        skin.bar,
        "transition-[box-shadow,border-color] duration-200 hover:shadow-surface-hover hover:border-zinc-600/80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-caption-foreground">{label}</p>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg sm:size-11", skin.iconWrap)}>
          <Icon className="size-5 sm:size-5" aria-hidden />
        </div>
      </div>
      <p className={cn("mt-4 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl", skin.value)}>{value}</p>
      {sub ? <p className="mt-2 text-sm font-medium leading-snug text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function PlaceholderKpi({ label, icon: Icon }: { label: string; icon: typeof Banknote }) {
  const key = label.toLowerCase();
  const iconWrap =
    key.includes("caisse") || key.includes("courant")
      ? "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30"
      : key.includes("chiffre") || key.includes("jour")
        ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30"
        : key.includes("dépense")
          ? "bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30"
          : "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30";

  return (
    <div
      className={cn(
        cardSurface,
        "flex min-h-[9.5rem] flex-col border-dashed border-zinc-600 p-5 hover:border-zinc-500/80 sm:min-h-[10.5rem] sm:p-6",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-caption-foreground">{label}</p>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg sm:size-11", iconWrap)}>
          <Icon className="size-5" aria-hidden />
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold tabular-nums text-muted-foreground sm:text-4xl">—</p>
      <p className="mt-2 text-sm font-medium text-muted-foreground">Après ouverture</p>
    </div>
  );
}

function LedgerTableSection({
  filteredRows,
  activeShift,
  employees,
  txnSearch,
  setTxnSearch,
  onReprintReceipt,
  lockedWithoutShift,
}: {
  filteredRows: FinancialTransaction[];
  activeShift: { id: string; cashierName: string } | null;
  employees: { id: string; name: string }[];
  txnSearch: string;
  setTxnSearch: (v: string) => void;
  onReprintReceipt: (id: string) => void;
  lockedWithoutShift: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Journal des transactions</h2>
          <p className="mt-0.5 text-sm font-medium text-muted-foreground">
            {lockedWithoutShift
              ? "S’active dès l’ouverture du shift — même structure que pendant le service."
              : "Mouvements du shift — recherche instantanée."}
          </p>
        </div>
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-caption-foreground" aria-hidden />
          <Input
            value={txnSearch}
            onChange={(e) => setTxnSearch(e.target.value)}
            placeholder="Rechercher facture, type, libellé…"
            className="h-10 pl-9"
            disabled={lockedWithoutShift}
          />
        </div>
      </div>

      <div className={cn(cardSurface, "overflow-hidden p-0 hover:border-border")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted shadow-surface-sink">
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Facture</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Détail</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caissier</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paiement</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Montant</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Heure</th>
                <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statut</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {lockedWithoutShift ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm font-medium text-muted-foreground">
                    Aucun shift ouvert — ouvrez la caisse pour enregistrer encaissements, dépenses et remboursements. Le
                    journal apparaîtra ici ligne par ligne.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm font-medium text-muted-foreground">
                    Aucune ligne pour ce filtre — les encaissements apparaîtront ici.
                  </td>
                </tr>
              ) : (
                filteredRows.map((t, i) => {
                  const cashier =
                    employees.find((e) => e.id === t.attributedEmployeeId)?.name ?? activeShift!.cashierName;
                  const amt = Math.abs(t.amountDa);
                  const timeStr = new Date(t.createdAtMs).toLocaleTimeString("fr-DZ", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                  const st = rowStatus(t);
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        "border-b border-border transition-colors",
                        i % 2 === 1 && "bg-muted/50",
                        "hover:bg-muted/90",
                      )}
                    >
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground">INV-{t.id.slice(0, 8)}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                          {orderTypeLabel(t)}
                        </span>
                      </td>
                      <td className="max-w-[12rem] px-3 py-3 font-medium text-foreground">{detailLabel(t)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{cashier}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-foreground">
                          {paymentLabel(t.kind)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-3 text-right text-base font-semibold tabular-nums",
                          t.amountDa < 0 ? "text-rose-400" : "text-emerald-400",
                        )}
                      >
                        {t.amountDa < 0 ? "−" : ""}
                        {formatDa(amt)}
                      </td>
                      <td className="px-3 py-3 tabular-nums text-muted-foreground">{timeStr}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                            st.className,
                          )}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => onReprintReceipt(t.id.slice(0, 8))}
                        >
                          Réimprimer
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function CaissePage() {
  usePageRouteDiagnostics("caisse");
  const nowMs = useLiveNow(1000);
  const activeShift = useCaisseStore((s) => s.activeShift);
  const lastClosedShift = useCaisseStore((s) => s.lastClosedShift);
  const transactions = useCaisseStore((s) => s.transactions);
  const closeShiftLocal = useCaisseStore((s) => s.closeShift);
  const hydrateFromApi = useCaisseStore((s) => s.hydrateFromApi);

  const usersQuery = useUsersQuery();
  const { createUser } = useUserMutations();
  const staffEmployees = useMemo(
    () => (usersQuery.data ?? []).map((u) => mapApiUserToCaisseEmployee(u)),
    [usersQuery.data],
  );

  const activeShiftQuery = useActiveShiftQuery();
  const openShiftMutation = useOpenShiftMutation();
  const closeShiftMutation = useCloseShiftMutation();
  const createExpenseMutation = useCreateExpenseMutation();
  const shiftRefundMutation = useShiftRefundMutation();
  const expenseCategoriesQuery = useExpenseCategoriesQuery();

  const expenseCategories = useMemo(() => {
    return (expenseCategoriesQuery.data || []).map((c: any) => ({
      id: c.id,
      label: c.name,
    }));
  }, [expenseCategoriesQuery.data]);

  useEffect(() => {
    if (activeShiftQuery.data) {
      hydrateFromApi(activeShiftQuery.data);
    }
  }, [activeShiftQuery.data, hydrateFromApi]);

  const dismissLastClosedShift = useCaisseStore((s) => s.dismissLastClosedShift);

  const metrics = useMemo(
    () => (activeShift ? computeShiftDrawerMetrics(activeShift, transactions) : null),
    [activeShift, transactions],
  );

  const closedMetrics = useMemo(
    () => (lastClosedShift ? computeShiftDrawerMetrics(lastClosedShift, transactions) : null),
    [lastClosedShift, transactions],
  );

  const ledgerRows = useMemo(() => {
    if (!activeShift) return [];
    const kinds: FinancialTransaction["kind"][] = ["sale_cash", "sale_card", "takeaway", "refund", "expense"];
    return transactions
      .filter((t) => t.shiftId === activeShift.id && kinds.includes(t.kind))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [activeShift, transactions]);

  const dineInDa =
    metrics != null ? Math.max(0, metrics.cashSalesDa + metrics.cardSalesDa) : 0;

  const netBalance =
    metrics != null ? metrics.totalSalesDa - metrics.expensesDa - metrics.refundsDa : 0;

  const [cashierName, setCashierName] = useState("");
  const [openingCashRaw, setOpeningCashRaw] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [txnSearch, setTxnSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const q = txnSearch.trim().toLowerCase();
    if (!q) return ledgerRows;
    return ledgerRows.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        paymentLabel(t.kind).toLowerCase().includes(q) ||
        orderTypeLabel(t).toLowerCase().includes(q),
    );
  }, [ledgerRows, txnSearch]);

  const flashFeedback = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 4000);
  };

  const shiftLoading = activeShiftQuery.isLoading && !activeShiftQuery.data;
  const shiftError = activeShiftQuery.isError;

  return (
    <PageShell>
    <PageQueryState
      label="la caisse"
      isLoading={shiftLoading}
      isError={shiftError}
      error={activeShiftQuery.error}
      onRetry={() => void activeShiftQuery.refetch()}
    >
    <div className="relative isolate mx-auto w-full max-w-[1360px] space-y-5 pb-12 pt-0 md:space-y-6 md:pb-16">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Calculator className="size-5 shrink-0 text-primary" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-widest text-caption-foreground">Caisse</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Espace caissier</h1>
            <p className="max-w-2xl text-sm font-medium leading-relaxed text-muted-foreground md:text-[0.9375rem]">
              Shift, tiroir, journal et actions — tout sur un écran pour le service.
            </p>
          </div>
          {activeShift ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900">
              Shift ouvert · <span className="ml-1 font-bold">{activeShift.cashierName}</span>
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground">
              Caisse fermée — ouvrez un shift
            </span>
          )}
        </div>
      </header>

      {!activeShift ? (
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-12 xl:items-stretch">
            <section className={cn(cardSurface, "flex flex-col gap-6 p-6 md:p-7 xl:col-span-7")}>
              <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-surface-sm ring-1 ring-indigo-900/10">
                    <Store className="size-6" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight text-foreground md:text-2xl">Ouvrir le shift</h2>
                    <p className="mt-1 text-sm font-medium leading-relaxed text-muted-foreground">
                      Saisissez le caissier et le fond de caisse. Les indicateurs à droite et le journal ci-dessous
                      s’activent immédiatement.
                    </p>
                  </div>
                </div>
                <p className="shrink-0 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span className="text-caption-foreground">Flux :</span> Ouverture → Encaissements → Clôture
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground" htmlFor="caisse-cashier">
                    Caissier
                  </label>
                  <Input
                    id="caisse-cashier"
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    placeholder="Nom affiché"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground" htmlFor="caisse-float">
                    Fond de caisse (DA)
                  </label>
                  <Input
                    id="caisse-float"
                    value={openingCashRaw}
                    onChange={(e) => setOpeningCashRaw(e.target.value)}
                    placeholder="ex. 5000"
                    inputMode="numeric"
                    className="h-11 font-mono tabular-nums"
                  />
                </div>
              </div>
              <Button
                type="button"
                size="lg"
                className="mt-auto h-11 w-full rounded-xl bg-primary px-8 text-base font-semibold shadow-surface-sm sm:w-auto sm:self-start"
                disabled={!cashierName.trim() || parseDaInput(openingCashRaw) <= 0 || openShiftMutation.isPending}
                onClick={async () => {
                  try {
                    await openShiftMutation.mutateAsync({
                      openingCashFloat: parseDaInput(openingCashRaw).toFixed(2),
                    });
                    await activeShiftQuery.refetch();
                    setCashierName("");
                    setOpeningCashRaw("");
                    flashFeedback("Caisse ouverte avec succès.");
                  } catch (e: any) {
                    flashFeedback(e.message || "Erreur lors de l'ouverture de la caisse.");
                  }
                }}
              >
                <Store className="mr-2 size-5" aria-hidden />
                {openShiftMutation.isPending ? "Ouverture..." : "Ouvrir le shift"}
              </Button>
            </section>

            <div className="grid grid-cols-2 gap-3 xl:col-span-5">
              <PlaceholderKpi label="Caisse actuelle" icon={Wallet} />
              <PlaceholderKpi label="Chiffre du jour" icon={TrendingUp} />
              <PlaceholderKpi label="Dépenses" icon={Receipt} />
              <PlaceholderKpi label="Solde net" icon={Scale} />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
            <div className="space-y-4 xl:col-span-8">
              <LedgerTableSection
                filteredRows={[]}
                activeShift={null}
                employees={staffEmployees}
                txnSearch={txnSearch}
                setTxnSearch={setTxnSearch}
                onReprintReceipt={() => flashFeedback("Ouvrez un shift pour réimprimer.")}
                lockedWithoutShift
              />
            </div>
            <aside className="space-y-4 xl:col-span-4">
              <div className={cn(cardSurface, "space-y-3 p-4")}>
                <p className="text-sm font-semibold text-foreground">Rappels</p>
                <ul className="space-y-2 text-sm font-medium leading-snug text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                    Compter le fond avant d’enregistrer l’ouverture.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                    Les ventes à emporter livrées alimentent le journal automatiquement.
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                    Dépenses et remboursements : disponibles après ouverture du shift.
                  </li>
                </ul>
              </div>
              <CaisseEmployeesPanel
                employees={staffEmployees}
                shiftTotalSalesDa={0}
                onAddEmployee={() => setAddEmployeeOpen(true)}
              />
              <div className={cn(cardSurface, "p-4")}>
                <p className="text-sm font-semibold text-foreground">Actions (aperçu)</p>
                <div className="mt-3 space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-start gap-2 px-3 text-muted-foreground"
                    onClick={() => flashFeedback("Ouvrez un shift pour réimprimer un ticket.")}
                  >
                    <Printer className="size-4 text-caption-foreground" aria-hidden />
                    Réimprimer ticket
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-start gap-2 px-3 text-muted-foreground"
                    onClick={() => flashFeedback("Ouvrez un shift pour ouvrir le tiroir-caisse.")}
                  >
                    <Wallet className="size-4 text-caption-foreground" aria-hidden />
                    Ouvrir tiroir
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      {activeShift && metrics ? (
        <div className="space-y-5">
          <DineInOrderQuickSearch />
          <div className="grid gap-4 xl:grid-cols-12 xl:items-stretch">
            <section className={cn(cardSurface, "flex flex-col gap-5 p-6 md:p-7 xl:col-span-7")}>
              <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-caption-foreground">Shift en cours</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                    {activeShift.cashierName}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    Ouvert le{" "}
                    {new Date(activeShift.openedAtMs).toLocaleString("fr-DZ", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · durée{" "}
                    <span className="font-semibold text-foreground">{formatShiftDuration(activeShift.openedAtMs, nowMs)}</span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 rounded-lg border-border px-5 text-sm font-semibold text-foreground shadow-surface-xs hover:bg-muted hover:shadow-surface-sm"
                  onClick={() => setCloseOpen(true)}
                >
                  Clôturer le shift
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-muted px-4 py-3 shadow-surface-xs">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-caption-foreground">Tiroir théorique</p>
                    <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground sm:text-xl">
                      {formatDa(metrics.expectedDrawerCashDa)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-caption-foreground">Chiffre du shift</p>
                    <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground sm:text-xl">
                      {formatDa(metrics.totalSalesDa)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-caption-foreground">Dépenses / remb.</p>
                    <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground sm:text-xl">
                      {formatDa(metrics.expensesDa + metrics.refundsDa)}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { k: "Caissier", v: activeShift.cashierName },
                  {
                    k: "Ouverture",
                    v: new Date(activeShift.openedAtMs).toLocaleString("fr-DZ", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  },
                  { k: "Durée", v: formatShiftDuration(activeShift.openedAtMs, nowMs) },
                  { k: "Fond initial", v: formatDa(activeShift.openingCashDa), mono: true },
                ].map((row) => (
                  <div key={row.k} className="surface-sunken px-3 py-3 sm:px-4">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-caption-foreground">{row.k}</dt>
                    <dd
                      className={cn(
                        "mt-1 text-base font-semibold text-foreground",
                        "mono" in row && row.mono && "font-mono tabular-nums tracking-tight",
                      )}
                    >
                      {row.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="grid grid-cols-2 gap-3 xl:col-span-5">
              <KpiCard
                accent="cash"
                icon={Wallet}
                label="Caisse actuelle"
                value={formatDa(metrics.expectedDrawerCashDa)}
                sub="Tiroir théorique"
              />
              <KpiCard
                accent="revenue"
                icon={TrendingUp}
                label="Chiffre du shift"
                value={formatDa(metrics.totalSalesDa)}
                sub="Espèces + carte + emporter"
              />
              <KpiCard
                accent="expense"
                icon={Receipt}
                label="Dépenses"
                value={formatDa(metrics.expensesDa)}
                sub="Sorties enregistrées"
              />
              <KpiCard
                accent="net"
                icon={Scale}
                label="Solde net"
                value={formatDa(Math.max(0, netBalance))}
                sub="Ventes − dépenses − remb."
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
            <div className="space-y-5 xl:col-span-8">
              {feedback ? (
                <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm font-medium text-foreground shadow-surface-xs ring-1 ring-white/[0.06]" role="status">
                  {feedback}
                </p>
              ) : null}
              <LedgerTableSection
                filteredRows={filteredRows}
                activeShift={activeShift}
                employees={staffEmployees}
                txnSearch={txnSearch}
                setTxnSearch={setTxnSearch}
                onReprintReceipt={(id) => flashFeedback(`Réimpression du ticket ${id} — bientôt disponible.`)}
                lockedWithoutShift={false}
              />

              <section>
                <h2 className="mb-3 text-lg font-semibold text-foreground">Synthèse paiements</h2>
                <div className={cn(cardSurface, "grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5")}>
                  {(
                    [
                      {
                        k: "Espèces",
                        v: formatDa(metrics.cashSalesDa),
                        icon: Banknote,
                        sub: "Encaissements espèces",
                        tone: "text-orange-600",
                      },
                      {
                        k: "Carte",
                        v: formatDa(metrics.cardSalesDa),
                        icon: CreditCard,
                        sub: "TPE / carte",
                        tone: "text-sky-600",
                      },
                      {
                        k: "À emporter",
                        v: formatDa(metrics.takeawayRevenueDa),
                        icon: Package,
                        sub: "Livraisons enregistrées",
                        tone: "text-violet-600",
                      },
                      {
                        k: "Salle / caisse",
                        v: formatDa(dineInDa),
                        icon: UtensilsCrossed,
                        sub: "Hors emporter",
                        tone: "text-indigo-600",
                      },
                    ] as const
                  ).map((row) => (
                    <div
                      key={row.k}
                      className="rounded-xl border border-border bg-secondary p-3 shadow-surface-xs ring-1 ring-white/[0.06] transition-shadow hover:shadow-surface-sm sm:p-4"
                    >
                      <div className="flex items-center gap-2">
                        <row.icon className={cn("size-4 shrink-0 sm:size-5", row.tone)} aria-hidden />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-caption-foreground">{row.k}</span>
                      </div>
                      <p className={cn("mt-2 text-xl font-bold tabular-nums sm:text-2xl", row.tone)}>{row.v}</p>
                      <p className="mt-0.5 text-xs font-medium leading-snug text-muted-foreground">{row.sub}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-4 xl:col-span-4">
              <CaisseEmployeesPanel
                employees={staffEmployees}
                shiftTotalSalesDa={metrics.totalSalesDa}
                onAddEmployee={() => setAddEmployeeOpen(true)}
              />
              <div className={cn(cardSurface, "p-4")}>
                <p className="text-sm font-semibold text-foreground">Actions rapides</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">Raccourcis du poste</p>
                <div className="mt-3 space-y-2">
                  {(
                    [
                      {
                        key: "exp",
                        label: fr.caissePage.addExpense,
                        icon: Receipt,
                        iconClass: "text-orange-600",
                        onClick: () => setExpenseOpen(true),
                      },
                      {
                        key: "ref",
                        label: "Remboursement",
                        icon: RotateCcw,
                        iconClass: "text-rose-600",
                        onClick: () => setRefundOpen(true),
                      },
                      {
                        key: "print",
                        label: "Réimprimer ticket",
                        icon: Printer,
                        iconClass: "text-caption-foreground",
                        onClick: () => flashFeedback("Réimpression — sélectionnez une ligne du journal."),
                      },
                      {
                        key: "drawer",
                        label: "Ouvrir tiroir",
                        icon: Wallet,
                        iconClass: "text-emerald-600",
                        onClick: () => flashFeedback("Ouverture du tiroir — configurez l’imprimante dans Paramètres."),
                      },
                    ] as const
                  ).map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={a.onClick}
                      className={cn(
                        "flex h-11 w-full items-center gap-3 rounded-lg border border-border bg-secondary px-3 text-left text-sm font-semibold text-foreground shadow-surface-xs",
                        "transition-[box-shadow,border-color,background-color] hover:border-border hover:bg-muted hover:shadow-surface-sm",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      )}
                    >
                      <a.icon className={cn("size-5 shrink-0", a.iconClass)} aria-hidden />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={cn(cardSurface, "p-4")}>
                <p className="text-sm font-semibold text-foreground">Rappels</p>
                <ul className="mt-2 space-y-2 text-sm font-medium text-muted-foreground">
                  <li>Clôturer avec le comptage réel du tiroir.</li>
                  <li>Les commandes à emporter livrées s’ajoutent au journal automatiquement.</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      <p className="border-t border-border pt-4 text-center text-xs font-medium text-muted-foreground md:text-sm">
        {activeShift ? (
          <>
            Les commandes <strong className="font-semibold text-foreground">à emporter livrées</strong> pendant le shift
            sont ajoutées automatiquement au journal.
          </>
        ) : (
          <>Ouvrez un shift pour activer le journal et les indicateurs en direct.</>
        )}
      </p>

      {activeShift && metrics ? (
        <CaisseCloseShiftModal
          open={closeOpen}
          onOpenChange={setCloseOpen}
          shift={activeShift}
          metrics={metrics}
          onConfirmClose={async (input) => {
            try {
              await closeShiftMutation.mutateAsync({
                shiftId: activeShift.id,
                body: {
                  closingCashCount: input.countedCashDa.toFixed(2),
                  notes: input.notes,
                },
              });
              closeShiftLocal(input);
              await activeShiftQuery.refetch();
              setCloseOpen(false);
              setSummaryOpen(true);
              flashFeedback("Shift clôturé avec succès.");
            } catch (e: any) {
              flashFeedback(e.message || "Erreur lors de la clôture du shift.");
              throw e;
            }
          }}
        />
      ) : null}

      <CaisseShiftSummaryModal
        open={summaryOpen}
        onOpenChange={(v) => {
          setSummaryOpen(v);
          if (!v) dismissLastClosedShift();
        }}
        shift={lastClosedShift}
        metrics={closedMetrics}
      />

      <CaisseAddExpenseModal
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        categories={expenseCategories}
        onSubmit={async (input) => {
          if (!activeShift) return;
          try {
            await createExpenseMutation.mutateAsync({
              shiftId: activeShift.id,
              categoryId: input.categoryId,
              amount: input.amountDa.toFixed(2),
              description: input.notes,
              paymentMethod: input.paymentMethod?.toUpperCase() || "CASH",
            });
            await activeShiftQuery.refetch();
            flashFeedback(fr.caissePage.expenseRecorded);
            setExpenseOpen(false);
          } catch (e: any) {
            flashFeedback(e.message || "Erreur lors de l'enregistrement de la dépense.");
            throw e;
          }
        }}
      />

      <CaisseRefundModal
        open={refundOpen}
        onOpenChange={setRefundOpen}
        employees={staffEmployees}
        onSubmit={async (input) => {
          if (!activeShift) return;
          try {
            await shiftRefundMutation.mutateAsync({
              shiftId: activeShift.id,
              amount: input.amountDa.toFixed(2),
              notes: input.notes,
            });
            await activeShiftQuery.refetch();
            flashFeedback("Remboursement enregistré.");
            setRefundOpen(false);
          } catch (e: any) {
            flashFeedback(e.message || "Erreur lors du remboursement.");
            throw e;
          }
        }}
      />

      <CaisseAddEmployeePanel
        open={addEmployeeOpen}
        onOpenChange={setAddEmployeeOpen}
        onSave={async (input) => {
          try {
            await createUser.mutateAsync(buildUserCreateBody(input));
            await usersQuery.refetch();
            flashFeedback(fr.caissePage.employeeAdded);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Erreur lors de l'ajout du collaborateur.";
            flashFeedback(msg);
            throw e;
          }
        }}
      />
    </div>
    </PageQueryState>
    </PageShell>
  );
}
