/**
 * Immutable-style payloads for future outbox / realtime / analytics consumers.
 * Keep JSON-serializable and versionable.
 */
export type OrderLifecyclePhase =
  | "CREATED"
  | "LINES_UPDATED"
  | "STATUS_CHANGED"
  | "PAYMENT_APPLIED"
  | "COMPLETED"
  | "CANCELLED";

export type OrderLifecycleEventV1 = {
  v: 1;
  phase: OrderLifecyclePhase;
  restaurantId: string;
  orderId: string;
  orderNumber: string;
  occurredAt: string;
  /** Optional totals snapshot for analytics pipelines */
  totals?: {
    subtotal: string;
    total: string;
    paidTotal: string;
    paymentStatus: string;
  };
};
