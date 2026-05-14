/**
 * Versioned QR payload contracts for receipts / table tickets (client encodes to bitmap if needed).
 * Server ESC/POS path uses UTF-8 string in `qrModel2` when payload is URL-like.
 */
export type QrPayloadTableTicketV1 = {
  v: 1;
  t: "table_ticket";
  restaurantSlug: string;
  orderId: string;
  ticketPublicCode: string | null;
};

export type QrPayloadPaymentReceiptV1 = {
  v: 1;
  t: "payment_receipt";
  restaurantSlug: string;
  paymentId: string;
};

export type QrPayloadV1 = QrPayloadTableTicketV1 | QrPayloadPaymentReceiptV1;

export function stringifyQrPayload(payload: QrPayloadV1): string {
  return JSON.stringify(payload);
}
