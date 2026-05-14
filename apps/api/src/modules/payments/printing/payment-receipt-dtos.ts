import type { Prisma } from "@prisma/client";

/**
 * Thermal / PDF receipt payloads (no printer I/O). Renderer maps to ESC/POS later.
 */
export type PaymentReceiptLineDto = {
  description: string;
  quantity: number;
  lineTotal: string;
  /** Comma-separated modifier labels for thermal layout. */
  modifierLabels: string | null;
};

export type PaymentReceiptDocumentDto = {
  kind: "payment_receipt";
  restaurantName: string;
  orderNumber: string;
  tableNumber: string | null;
  paymentId: string;
  paymentMethod: string;
  amountApplied: string;
  amountTendered: string | null;
  changeGiven: string | null;
  orderSubtotal: string;
  orderTax: string;
  orderDiscount: string;
  orderTotal: string;
  netPaidAfter: string;
  balanceDueAfter: string;
  lines: PaymentReceiptLineDto[];
};

export function buildPaymentReceiptDto(input: {
  restaurantName: string;
  orderNumber: string;
  tableNumber: string | null;
  paymentId: string;
  paymentMethod: string;
  amountApplied: Prisma.Decimal;
  amountTendered: Prisma.Decimal | null;
  changeGiven: Prisma.Decimal | null;
  orderSubtotal: Prisma.Decimal;
  orderTax: Prisma.Decimal;
  orderDiscount: Prisma.Decimal;
  orderTotal: Prisma.Decimal;
  netPaidAfter: Prisma.Decimal;
  items: {
    nameSnapshot: string;
    quantity: number;
    lineSubtotal: Prisma.Decimal;
    modifierLabels: string | null;
  }[];
}): PaymentReceiptDocumentDto {
  const balanceDueAfter = input.orderTotal.sub(input.netPaidAfter);
  return {
    kind: "payment_receipt",
    restaurantName: input.restaurantName,
    orderNumber: input.orderNumber,
    tableNumber: input.tableNumber,
    paymentId: input.paymentId,
    paymentMethod: input.paymentMethod,
    amountApplied: input.amountApplied.toFixed(2),
    amountTendered: input.amountTendered?.toFixed(2) ?? null,
    changeGiven: input.changeGiven?.toFixed(2) ?? null,
    orderSubtotal: input.orderSubtotal.toFixed(2),
    orderTax: input.orderTax.toFixed(2),
    orderDiscount: input.orderDiscount.toFixed(2),
    orderTotal: input.orderTotal.toFixed(2),
    netPaidAfter: input.netPaidAfter.toFixed(2),
    balanceDueAfter: balanceDueAfter.toFixed(2),
    lines: input.items.map((it) => ({
      description: it.nameSnapshot,
      quantity: it.quantity,
      lineTotal: it.lineSubtotal.toFixed(2),
      modifierLabels: it.modifierLabels,
    })),
  };
}
