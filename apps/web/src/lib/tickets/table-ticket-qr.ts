/**
 * Future QR / scanner payload (versioned). Encode the same shape in QR when hardware is wired.
 * Do not put secrets here — only public correlation ids.
 */
export type TableTicketQrPayloadV1 = {
  v: 1;
  restaurantId: string;
  orderId: string;
  orderNumber: string;
  ticketPublicCode: string;
  tableNumberLabel: string;
};

export function encodeTableTicketQrPayloadV1(payload: TableTicketQrPayloadV1): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function decodeTableTicketQrPayloadV1(raw: string): TableTicketQrPayloadV1 | null {
  try {
    const json = decodeURIComponent(escape(atob(raw)));
    const parsed = JSON.parse(json) as TableTicketQrPayloadV1;
    if (parsed?.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}
