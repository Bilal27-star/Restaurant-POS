import { CheckCircle2, Clock, Flame, Loader2, Utensils } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useKitchenOrdersQuery } from "@/hooks/use-kitchen-orders-query";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";

export function KitchenPage() {
  const qc = useQueryClient();
  const { data: orders = [], isLoading, isError } = useKitchenOrdersQuery();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const preparingOrders = useMemo(() => {
    return orders.filter((o: any) => o.status === "PREPARING" || o.status === "PENDING");
  }, [orders]);

  const readyOrders = useMemo(() => {
    return orders.filter((o: any) => o.status === "READY");
  }, [orders]);

  const handleUpdateStatus = async (orderId: string, status: "READY" | "COMPLETED") => {
    setBusyOrderId(orderId);
    setActionError(null);
    try {
      if (status === "READY") {
        await getAppApi().orders.patch(orderId, { status: "READY" });
      } else {
        await getAppApi().orders.complete(orderId, {});
      }
      await qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
    } catch (err) {
      console.error("Failed to update order status", err);
      setActionError("Impossible de mettre à jour le statut de la commande.");
    } finally {
      setBusyOrderId(null);
    }
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-6">
      {actionError ? (
        <p className="rounded-lg border border-rose-500/35 bg-rose-950/30 px-3 py-2 text-sm font-medium text-rose-100" role="alert">
          {actionError}
        </p>
      ) : null}

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{fr.kitchen.title}</h1>
          <p className="text-sm text-muted-foreground">{fr.kitchen.subtitle}</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 rounded-lg bg-orange-500/10 px-3 py-1.5 text-sm font-semibold text-orange-400 border border-orange-500/20">
            <Flame className="h-4 w-4" />
            {preparingOrders.length} {fr.kitchen.statusPreparing}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-4 w-4" />
            {readyOrders.length} {fr.kitchen.statusReady}
          </div>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center space-y-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02]">
          <Utensils className="h-12 w-12 text-muted-foreground opacity-20" />
          <p className="text-lg font-medium text-muted-foreground">{fr.kitchen.empty}</p>
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto pb-10 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {preparingOrders.map((order: any) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              busy={busyOrderId === order.id}
              onMarkReady={() => void handleUpdateStatus(order.id, "READY")}
            />
          ))}
          {readyOrders.map((order: any) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              busy={busyOrderId === order.id}
              onMarkCompleted={() => void handleUpdateStatus(order.id, "COMPLETED")}
              isReady
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KitchenOrderCard({
  order,
  onMarkReady,
  onMarkCompleted,
  isReady = false,
  busy = false,
}: {
  order: any;
  onMarkReady?: () => void;
  onMarkCompleted?: () => void;
  isReady?: boolean;
  busy?: boolean;
}) {
  const elapsedMinutes = Math.floor((Date.now() - new Date(order.openedAt).getTime()) / 60000);
  const isUrgent = elapsedMinutes > 15;

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-pos-depth/40 transition-all duration-300",
        isReady ? "border-emerald-500/30" : isUrgent ? "border-red-500/40 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.1)]" : "border-white/10",
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 p-4">
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {order.type === "DINE_IN" ? `${fr.kitchen.table} ${order.table?.number ?? "—"}` : fr.kitchen.takeaway}
          </span>
          <span className="text-lg font-bold text-foreground">#{order.orderNumber}</span>
        </div>
        <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", isUrgent ? "bg-red-500/20 text-red-400" : "bg-white/5 text-muted-foreground")}>
          <Clock className="h-3 w-3" />
          {elapsedMinutes}m
        </div>
      </div>

      <div className="flex-1 space-y-4 p-4">
        <ul className="space-y-3">
          {order.items.map((item: any, idx: number) => (
            <li key={item.id || idx} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <span className="text-base font-semibold text-foreground">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded bg-white/10 text-xs font-bold">
                    {item.quantity}
                  </span>
                  {item.nameSnapshot}
                </span>
              </div>
              {item.modifiers?.length > 0 && (
                <ul className="ml-8 space-y-1">
                  {item.modifiers.map((mod: any) => (
                    <li key={mod.id} className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-violet-400/50" />
                      {mod.label}
                    </li>
                  ))}
                </ul>
              )}
              {item.kitchenNotes && (
                <div className="ml-8 mt-1 rounded bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-300 border border-orange-500/20">
                  {item.kitchenNotes}
                </div>
              )}
            </li>
          ))}
        </ul>

        {order.kitchenNotes && (
          <div className="mt-4 rounded-xl bg-violet-500/10 p-3 border border-violet-500/20">
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300 mb-1">Notes Cuisine</p>
            <p className="text-sm text-foreground italic">"{order.kitchenNotes}"</p>
          </div>
        )}
      </div>

      <div className="p-4 pt-0">
        <Button
          onClick={isReady ? onMarkCompleted : onMarkReady}
          disabled={busy}
          className={cn(
            "h-12 w-full rounded-xl font-bold shadow-lg transition-all active:scale-[0.98]",
            isReady
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20"
              : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-900/20"
          )}
        >
          {busy ? "…" : isReady ? fr.kitchen.markCompleted : fr.kitchen.markReady}
        </Button>
      </div>
    </div>
  );
}
