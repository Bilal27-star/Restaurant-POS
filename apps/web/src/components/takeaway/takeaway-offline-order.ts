import type { TakeawayOrderLineItem } from "./takeaway-order-types";

/** Local takeaway ticket shape (POS bridge + caisse sync). Not the REST `SerializedTakeawayOrder`. */

export type TakeawayOfflineStatus = "new" | "preparing" | "ready" | "delivered" | "cancelled";

export interface TakeawayOfflineOrder {
  id: string;
  takeawayNumber: number;
  posReference: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerDeliveryNotes: string;
  items: TakeawayOrderLineItem[];
  kitchenNotes: string;
  totalAmountDa: number;
  status: TakeawayOfflineStatus;
  createdAtMs: number;
  estimatedReadyAtMs: number;
  deliveredAtMs?: number;
}
