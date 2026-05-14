import type { Prisma } from "@prisma/client";

/**
 * Pure DTOs for kitchen tickets, customer receipts, and table tickets (no I/O).
 * Wire to ESC/POS / PDF renderers later.
 */
export type KitchenTicketLineDto = {
  qty: number;
  name: string;
  modifiers: { label: string; priceDelta: string }[];
  removedIngredients: string[];
  kitchenNotes?: string | null;
};

export type KitchenTicketDocumentDto = {
  kind: "kitchen_ticket";
  restaurantName: string;
  orderNumber: string;
  tableNumber?: string | null;
  orderType: string;
  status: string;
  lines: KitchenTicketLineDto[];
  kitchenNotes?: string | null;
};

export type CustomerReceiptLineDto = {
  qty: number;
  description: string;
  unitPrice: string;
  lineTotal: string;
};

export type CustomerReceiptDocumentDto = {
  kind: "customer_receipt";
  restaurantName: string;
  orderNumber: string;
  lines: CustomerReceiptLineDto[];
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  total: string;
  paidTotal: string;
  paymentStatus: string;
};

export function buildKitchenTicketDto(input: {
  restaurantName: string;
  orderNumber: string;
  tableNumber?: string | null;
  orderType: string;
  status: string;
  kitchenNotes?: string | null;
  items: {
    quantity: number;
    nameSnapshot: string;
    kitchenNotes?: string | null;
    removedIngredients: unknown;
    modifiers: { label: string; priceDelta: Prisma.Decimal }[];
  }[];
}): KitchenTicketDocumentDto {
  const lines: KitchenTicketLineDto[] = input.items.map((it) => ({
    qty: it.quantity,
    name: it.nameSnapshot,
    modifiers: it.modifiers.map((m) => ({
      label: m.label,
      priceDelta: m.priceDelta.toFixed(2),
    })),
    removedIngredients: normalizeStringArray(it.removedIngredients),
    kitchenNotes: it.kitchenNotes,
  }));
  return {
    kind: "kitchen_ticket",
    restaurantName: input.restaurantName,
    orderNumber: input.orderNumber,
    tableNumber: input.tableNumber,
    orderType: input.orderType,
    status: input.status,
    kitchenNotes: input.kitchenNotes,
    lines,
  };
}

export type TableTicketDocumentDto = {
  kind: "table_ticket";
  restaurantName: string;
  orderNumber: string;
  ticketPublicCode: string | null;
  tableNumber: string | null;
  orderType: string;
};

export function buildTableTicketDto(input: {
  restaurantName: string;
  orderNumber: string;
  ticketPublicCode: string | null;
  tableNumber: string | null;
  orderType: string;
}): TableTicketDocumentDto {
  return {
    kind: "table_ticket",
    restaurantName: input.restaurantName,
    orderNumber: input.orderNumber,
    ticketPublicCode: input.ticketPublicCode,
    tableNumber: input.tableNumber,
    orderType: input.orderType,
  };
}

export function buildCustomerReceiptDto(input: {
  restaurantName: string;
  orderNumber: string;
  subtotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  paidTotal: Prisma.Decimal;
  paymentStatus: string;
  items: { quantity: number; nameSnapshot: string; unitPrice: Prisma.Decimal; lineSubtotal: Prisma.Decimal }[];
}): CustomerReceiptDocumentDto {
  return {
    kind: "customer_receipt",
    restaurantName: input.restaurantName,
    orderNumber: input.orderNumber,
    lines: input.items.map((it) => ({
      qty: it.quantity,
      description: it.nameSnapshot,
      unitPrice: it.unitPrice.toFixed(2),
      lineTotal: it.lineSubtotal.toFixed(2),
    })),
    subtotal: input.subtotal.toFixed(2),
    taxTotal: input.taxTotal.toFixed(2),
    discountTotal: input.discountTotal.toFixed(2),
    total: input.total.toFixed(2),
    paidTotal: input.paidTotal.toFixed(2),
    paymentStatus: input.paymentStatus,
  };
}

function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}
