import { useEffect } from "react";
import { useTakeawayQueueStore } from "@/components/takeaway/takeaway-queue-store";
import { useCaisseStore } from "./caisse-store";

/** Links delivered takeaway orders into the active shift ledger (idempotent). */
export function useCaisseTakeawaySync(activeShiftId: string | null) {
  const orders = useTakeawayQueueStore((s) => s.orders);
  const ingestTakeawayDelivery = useCaisseStore((s) => s.ingestTakeawayDelivery);

  useEffect(() => {
    if (!activeShiftId) return;
    for (const o of orders) {
      if (o.status !== "delivered") continue;
      const at = o.deliveredAtMs ?? o.createdAtMs;
      ingestTakeawayDelivery({
        id: o.id,
        takeawayNumber: o.takeawayNumber,
        customerName: o.customerName,
        totalAmountDa: o.totalAmountDa,
        deliveredAtMs: at,
      });
    }
  }, [orders, activeShiftId, ingestTakeawayDelivery]);
}
