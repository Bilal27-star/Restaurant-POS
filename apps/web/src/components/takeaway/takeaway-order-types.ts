/** Takeaway / delivery queue — UI filter keys (mapped to API `OrderStatus`). */

import type { SerializedTakeawayOrder, TakeawayOrderStatusApi } from "@/types/serialized-order";

/** Local queue / POS bridge line shape (not the API order line). */
export interface TakeawayOrderLineItem {
  quantity: number;
  name: string;
}

export type TakeawayOrder = SerializedTakeawayOrder;

export type TakeawayStatusFilter = "all" | "new" | "preparing" | "ready" | "delivered";

const FILTER_TO_STATUS: Record<Exclude<TakeawayStatusFilter, "all">, TakeawayOrderStatusApi> = {
  new: "PENDING",
  preparing: "PREPARING",
  ready: "READY",
  delivered: "COMPLETED",
};

/** Optional browse chip → status label (not applied to kanban column assignment). */
export function takeawayFilterMatches(filter: TakeawayStatusFilter, status: TakeawayOrderStatusApi): boolean {
  if (filter === "all") return true;
  return FILTER_TO_STATUS[filter] === status;
}
