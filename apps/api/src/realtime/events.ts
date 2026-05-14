/**
 * Canonical Socket.IO event names. Colon namespaces mirror domain action for scalability.
 */
export const RealtimeEvents = {
  ORDER_CREATED: "order:created",
  ORDER_UPDATED: "order:updated",
  ORDER_COMPLETED: "order:completed",
  ORDER_CANCELLED: "order:cancelled",
  TABLE_UPDATED: "table:updated",
  PAYMENT_CAPTURED: "payment:captured",
  PAYMENT_REFUNDED: "payment:refunded",
  ANALYTICS_TICK: "analytics:tick",
  SHIFT_UPDATED: "shift:updated",
  /** Reserved for future admin broadcasts (settings, roles). */
  ADMIN_BROADCAST: "admin:broadcast",
  /** Client ack / future sync protocol (no-op today). */
  SYNC_HELLO: "sync:hello",
} as const;

export type RealtimeEventName = (typeof RealtimeEvents)[keyof typeof RealtimeEvents];
