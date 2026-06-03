import { ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { ApiClientError } from "@pos/api-client";
import { TakeawayBoard } from "@/components/takeaway/takeaway-board";
import { TakeawayCheckoutModal } from "@/components/takeaway/takeaway-checkout-modal";
import { useLiveNow, useTakeawayOrders } from "@/components/takeaway/use-takeaway-orders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageQueryState } from "@/components/data/page-query-state";
import { PageShell } from "@/components/data/page-shell";
import { usePageRouteDiagnostics } from "@/hooks/use-page-route-diagnostics";
import { useTakeawayHistoryQuery } from "@/hooks/use-takeaway-history-query";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import type { SerializedTakeawayOrder } from "@/types/serialized-order";

export function TakeawayPage() {
  usePageRouteDiagnostics("takeaway");
  const nowMs = useLiveNow(1000);
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");
  const historyQuery = useTakeawayHistoryQuery(activeTab === "history");
  const {
    orders,
    ordersQuery,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    columnNew,
    columnPreparing,
    columnReady,
    columnDelivered,
    startPreparing,
    markReady,
    cancelOrder,
    refreshTakeawayQueries,
    kpis,
  } = useTakeawayOrders(nowMs);

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const cancelTarget = useMemo(
    () => orders.find((o) => o.id === cancelId) ?? null,
    [cancelId, orders],
  );
  const checkoutTarget = useMemo(
    () => orders.find((o) => o.id === checkoutId) ?? null,
    [checkoutId, orders],
  );

  const historyOrders = historyQuery.data ?? [];
  const hasHistoryData = historyOrders.length > 0;
  const hasBoardData = orders.length > 0;
  const boardLoading = ordersQuery.isPending && !hasBoardData && activeTab === "live";
  const boardError = ordersQuery.isError && !hasBoardData && activeTab === "live";
  const showDegradedBanner = ordersQuery.isError && hasBoardData && activeTab === "live";

  return (
    <PageShell fill>
    <PageQueryState
      label="les commandes à emporter"
      isLoading={boardLoading}
      isError={boardError}
      error={ordersQuery.error}
      onRetry={() => void ordersQuery.refetch()}
      className="relative isolate flex min-h-0 flex-1 flex-col gap-6 overflow-hidden"
      isEmpty={false}
    >
    <div className="relative isolate flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
      {actionWarning ? (
        <p className="shrink-0 rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-sm font-medium text-amber-100" role="status">
          {actionWarning}
        </p>
      ) : null}
      {actionError ? (
        <p className="shrink-0 rounded-lg border border-rose-500/35 bg-rose-950/30 px-3 py-2 text-sm font-medium text-rose-100" role="alert">
          {actionError}
        </p>
      ) : null}

      {showDegradedBanner ? (
        <div
          className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-100"
          role="status"
        >
          <span>{fr.dashboard.dashboardLoadError}</span>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => void ordersQuery.refetch()}>
            {fr.dashboard.retry}
          </Button>
        </div>
      ) : null}
      <header className="relative flex shrink-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-violet-300/90">
            <ShoppingBag className="size-6" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">{fr.takeawayPage.kicker}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{fr.takeawayPage.title}</h1>
          <p className="mt-1.5 max-w-xl text-sm font-medium leading-relaxed text-muted-foreground">
            {fr.takeawayPage.subtitle}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-white/[0.08] bg-zinc-900/50 p-1">
          <button
            onClick={() => setActiveTab("live")}
            className={cn(
              "px-4 py-1.5 text-sm font-semibold transition-all rounded-lg",
              activeTab === "live" ? "bg-violet-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
            En direct
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "px-4 py-1.5 text-sm font-semibold transition-all rounded-lg",
              activeTab === "history" ? "bg-violet-600 text-white shadow-lg" : "text-slate-400 hover:text-white"
            )}
          >
            Historique
          </button>
        </div>
      </header>

      {activeTab === "live" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <TakeawayBoard
          nowMs={nowMs}
          query={query}
          onQueryChange={setQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          kpis={kpis}
          columnNew={columnNew}
          columnPreparing={columnPreparing}
          columnReady={columnReady}
          columnDelivered={columnDelivered}
          onStartPreparing={startPreparing}
          onMarkReady={markReady}
          onEncaisser={setCheckoutId}
          onRequestCancel={setCancelId}
        />
        </div>
      ) : (
        <TakeawayHistory
          orders={historyOrders}
          isLoading={historyQuery.isPending && !hasHistoryData}
          isError={historyQuery.isError && !hasHistoryData}
          onRetry={() => void historyQuery.refetch()}
        />
      )}

      <Dialog open={cancelId !== null} onOpenChange={(open) => !open && setCancelId(null)}>
        <DialogContent className="surface-dark-ink border-white/[0.08] bg-zinc-950/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle>{fr.takeawayPage.cancelTitle}</DialogTitle>
            <DialogDescription>
              {cancelTarget ? (
                <>{fr.takeawayPage.cancelDesc(String(cancelTarget.orderNumber || ""), cancelTarget.customer?.name || "Client")}</>
              ) : (
                fr.takeawayPage.noSelection
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setCancelId(null)}>
              {fr.takeawayPage.keepOrder}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={!cancelTarget || cancelBusy}
              onClick={() => {
                void (async () => {
                  if (!cancelId) return;
                  setCancelBusy(true);
                  setActionError(null);
                  try {
                    await cancelOrder(cancelId);
                    setCancelId(null);
                  } catch (err) {
                    const msg =
                      err instanceof ApiClientError && typeof err.details === "object" && err.details !== null && "message" in err.details
                        ? String((err.details as Record<string, unknown>).message)
                        : err instanceof Error
                          ? err.message
                          : "Impossible d'annuler la commande.";
                    setActionError(msg || "Impossible d'annuler la commande.");
                  } finally {
                    setCancelBusy(false);
                  }
                })();
              }}
            >
              {cancelBusy ? "Annulation…" : fr.takeawayPage.cancelOrder}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TakeawayCheckoutModal
        order={checkoutTarget}
        open={checkoutId !== null}
        onOpenChange={(open) => !open && setCheckoutId(null)}
        onSuccess={() => {
          setCheckoutId(null);
          setActionError(null);
          refreshTakeawayQueries();
        }}
        onPrintWarning={() => setActionWarning(fr.takeawayCheckout.printWarning)}
      />
    </div>
    </PageQueryState>
    </PageShell>
  );
}

function TakeawayHistory({
  orders,
  isLoading,
  isError,
  onRetry,
}: {
  orders: SerializedTakeawayOrder[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const completed = useMemo(
    () =>
      orders
        .filter((o) => o.status === "COMPLETED" || o.status === "CANCELLED")
        .sort((a, b) => new Date(b.closedAt ?? b.openedAt).getTime() - new Date(a.closedAt ?? a.openedAt).getTime()),
    [orders],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-white/[0.08] bg-zinc-900/30 py-16 text-sm text-slate-400">
        Chargement…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/35 bg-red-950/25 px-6 py-16 text-center">
        <p className="text-sm text-red-100">{fr.dashboard.dashboardLoadError}</p>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg" onClick={onRetry}>
            {fr.dashboard.retry}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto rounded-2xl border border-white/[0.08] bg-zinc-900/30">
      <table className="w-full text-left">
        <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-white/[0.08]">
          <tr>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">N°</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Client</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Date</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400">Statut</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-400 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {completed.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">Aucune commande terminée.</td>
            </tr>
          ) : (
            completed.map((o) => (
              <tr key={o.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4 font-mono text-violet-300">#{o.orderNumber}</td>
                <td className="px-6 py-4">
                  <div className="font-semibold text-white">{o.customer?.name || "Client"}</div>
                  <div className="text-xs text-slate-400">{o.customer?.phone || "—"}</div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-300">
                  {new Date(o.closedAt ?? o.openedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                    o.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  )}>
                    {o.status === "COMPLETED" ? "Terminée" : "Annulée"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-bold text-white">
                  {parseFloat(o.total).toLocaleString("fr-FR")} DA
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
