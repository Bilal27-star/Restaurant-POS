/** Serialized order shape from `GET /orders` and `GET /orders/history` (matches API `serializeOrderEntity`). */

export type SerializedOrderCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
} | null;

export type SerializedOrderLine = {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  quantity: number;
};

export type TakeawayOrderStatusApi = "PENDING" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";

export type SerializedTakeawayOrder = {
  id: string;
  orderNumber: string;
  ticketPublicCode?: string | null;
  type: string;
  status: TakeawayOrderStatusApi;
  customerNotes?: string | null;
  kitchenNotes?: string | null;
  openedAt: string;
  closedAt?: string | null;
  customer: SerializedOrderCustomer;
  items: SerializedOrderLine[];
  total: string;
  version?: number;
  paymentStatus?: string;
};
