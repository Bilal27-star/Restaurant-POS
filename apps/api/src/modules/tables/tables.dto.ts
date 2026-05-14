export type ActiveOrderSummaryDto = {
  id: string;
  orderNumber: string;
  ticketPublicCode: string | null;
  guestCount: number;
  itemsCount: number;
  /** Total in major currency units (e.g. DZD), 2 decimal string from Prisma Decimal. */
  totalAmount: string;
  openedMinutesAgo: number;
  paymentStatus: string;
  status: string;
};

export type TableListRowDto = {
  id: string;
  restaurantId: string;
  floorId: string | null;
  /** Floor display name used as "zone" in POS UI. */
  zone: string | null;
  number: string;
  capacity: number;
  status: string;
  activeOrder: ActiveOrderSummaryDto | null;
};

export type TableListResponseDto = {
  tables: TableListRowDto[];
};

export type OrderItemModifierDetailDto = {
  label: string;
  priceDelta: string;
};

export type OrderItemDetailDto = {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  quantity: number;
  unitPrice: string;
  lineSubtotal: string;
  modifiers: OrderItemModifierDetailDto[];
};

export type ActiveOrderDetailDto = {
  id: string;
  orderNumber: string;
  ticketPublicCode: string | null;
  partySize: number | null;
  status: string;
  paymentStatus: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  total: string;
  paidTotal: string;
  version: number;
  openedAt: string;
  openedMinutesAgo: number;
  waiterName: string | null;
  items: OrderItemDetailDto[];
};

export type TableDetailResponseDto = {
  id: string;
  restaurantId: string;
  floorId: string | null;
  zone: string | null;
  number: string;
  capacity: number;
  status: string;
  activeOrder: ActiveOrderDetailDto | null;
};

export function decimalToMajorString(d: { toFixed: (n: number) => string }): string {
  return d.toFixed(2);
}

export function openedMinutesSince(openedAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - openedAt.getTime()) / 60_000));
}
