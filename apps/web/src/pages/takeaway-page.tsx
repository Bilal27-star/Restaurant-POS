import { ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { TakeawayBoard } from "@/components/takeaway/takeaway-board";
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
import { useTakeawayHistoryQuery } from "@/hooks/use-takeaway-history-query";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import type { SerializedTakeawayOrder } from "@/types/serialized-order";

export function TakeawayPage() {
  const nowMs = useLiveNow(1000);
  const historyQuery = useTakeawayHistoryQuery();
  const {
    orders,
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
    markDelivered,
    cancelOrder,
    kpis,
  } = useTakeawayOrders(nowMs);

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");
  const cancelTarget = useMemo(
    () => orders.find((o) => o.id === cancelId) ?? null,
    [cancelId, orders],
  );

  return (
    <div className="relative isolate flex min-h-0 flex-1 flex-col gap-6">
      <header className="relative flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
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
          onMarkDelivered={markDelivered}
          onRequestCancel={setCancelId}
        />
      ) : (
        <TakeawayHistory orders={historyQuery.data ?? []} isLoading={historyQuery.isLoading} />
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
              disabled={!cancelTarget}
              onClick={() => {
                if (cancelId) cancelOrder(cancelId);
                setCancelId(null);
              }}
            >
              {fr.takeawayPage.cancelOrder}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TakeawayHistory({ orders, isLoading }: { orders: SerializedTakeawayOrder[]; isLoading: boolean }) {
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
