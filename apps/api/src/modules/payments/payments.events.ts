/**
 * Serializable payloads for analytics / future outbox (revenue, shift, cashier KPIs).
 */
export type PaymentCapturedEventV1 = {
  v: 1;
  phase: "PAYMENT_CAPTURED";
  restaurantId: string;
  orderId: string;
  paymentId: string;
  shiftId: string | null;
  method: string;
  amount: string;
  orderCompleted: boolean;
  occurredAt: string;
};

export type PaymentRefundedEventV1 = {
  v: 1;
  phase: "PAYMENT_REFUNDED";
  restaurantId: string;
  orderId: string;
  paymentId: string;
  refundId: string;
  amount: string;
  occurredAt: string;
};
