/** Pure document models for thermal templates (no Prisma / Express). */

export type TableTicketDocument = {
  kind: "TABLE_TICKET";
  restaurantName: string;
  tableNumber: string;
  orderNumber: string;
  waiterName: string;
  printedAtIso: string;
  /** Short public code / keypad id */
  referenceCode: string | null;
  /** Optional QR payload (URL or ticket token) — rendered as GS QR when set */
  qrPayload?: string | null;
  footerNote?: string;
};

export type KitchenTicketLine = {
  qty: number;
  name: string;
  modifiers: { label: string }[];
  removedIngredients: string[];
  kitchenNotes?: string | null;
  /** Delta payload (payloadVersion 2). */
  previousQty?: number;
  deltaQty?: number;
  modifiersAdded?: string[];
  modifiersRemoved?: string[];
  removedIngredientsAdded?: string[];
  previousKitchenNotes?: string | null;
};

export type KitchenTicketSectionKind = "ADDED" | "REMOVED" | "MODIFIED" | "INFO";

export type KitchenTicketSection = {
  kind: KitchenTicketSectionKind;
  lines: KitchenTicketLine[];
  infoText?: string;
};

export type KitchenTicketMode = "NEW" | "UPDATE" | "CANCEL" | "INFO" | "FULL_REPRINT";

export type KitchenTicketDocument = {
  kind: "KITCHEN_TICKET";
  restaurantName: string;
  orderNumber: string;
  tableNumber: string | null;
  orderType: string;
  printedAtIso: string;
  lines: KitchenTicketLine[];
  orderKitchenNotes?: string | null;
  station?: string;
  waiterName?: string;
  /** Delta kitchen tickets (payloadVersion 2). */
  payloadVersion?: number;
  ticketMode?: KitchenTicketMode;
  sections?: KitchenTicketSection[];
};

export type CustomerReceiptLine = {
  name: string;
  qty: number;
  unitPrice: string;
  lineTotal: string;
  /** Modifier labels for this line (thermal). */
  modifiers?: string[];
};

export type CustomerReceiptDocument = {
  kind: "CUSTOMER_RECEIPT";
  restaurantName: string;
  addressLine?: string | null;
  phoneLine?: string | null;
  orderNumber: string;
  tableNumber: string | null;
  printedAtIso: string;
  lines: CustomerReceiptLine[];
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  total: string;
  paymentMethod: string;
  amountPaid: string;
  changeGiven: string | null;
  /** Cash tendered (customer); null for card. */
  cashTendered?: string | null;
  qrPayload?: string | null;
  cashierName?: string | null;
  /** When true, append drawer pulse before feed/cut (typical after cash sale). */
  openCashDrawerBeforeCut?: boolean;
};

export type ShiftSummaryDocument = {
  kind: "SHIFT_SUMMARY";
  restaurantName: string;
  shiftLabel: string;
  openedAtIso: string;
  closedAtIso: string | null;
  cashierName: string;
  currencyCode: string;
  grossSales: string;
  cashSales: string;
  cardSales: string;
  transferSales: string;
  refundsTotal: string;
  expenseTotal: string;
  openingFloat: string;
  closingNote?: string | null;
};

export type ExpenseReceiptDocument = {
  kind: "EXPENSE_RECEIPT";
  restaurantName: string;
  expenseId: string;
  categoryName: string;
  amount: string;
  paymentMethod: string;
  description: string;
  recordedBy: string | null;
  createdAtIso: string;
  shiftLabel?: string | null;
};

export type ThermalDocument =
  | TableTicketDocument
  | KitchenTicketDocument
  | CustomerReceiptDocument
  | ShiftSummaryDocument
  | ExpenseReceiptDocument;
