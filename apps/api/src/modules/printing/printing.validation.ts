import { z } from "zod";

const uuid = z.string().uuid();

export const tableTicketPayload = z
  .object({
    kind: z.literal("TABLE_TICKET"),
    restaurantName: z.string().min(1).max(200),
    tableNumber: z.string().min(1).max(40),
    orderNumber: z.string().min(1).max(80),
    waiterName: z.string().min(1).max(120),
    printedAtIso: z.string().min(1).max(80),
    referenceCode: z.string().max(40).nullable().optional(),
    qrPayload: z.string().max(2000).nullable().optional(),
    footerNote: z.string().max(500).optional(),
  })
  .strict();

export const kitchenLine = z
  .object({
    qty: z.coerce.number().int().min(1).max(999),
    name: z.string().min(1).max(200),
    modifiers: z.array(z.object({ label: z.string().max(120) })).default([]),
    removedIngredients: z.array(z.string().max(120)).default([]),
    kitchenNotes: z.string().max(2000).nullable().optional(),
    previousQty: z.coerce.number().int().min(0).max(999).optional(),
    deltaQty: z.coerce.number().int().min(-999).max(999).optional(),
    modifiersAdded: z.array(z.string().max(120)).optional(),
    modifiersRemoved: z.array(z.string().max(120)).optional(),
    removedIngredientsAdded: z.array(z.string().max(120)).optional(),
    previousKitchenNotes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const kitchenDeltaSection = z
  .object({
    kind: z.enum(["ADDED", "REMOVED", "MODIFIED", "INFO"]),
    lines: z.array(kitchenLine).max(200),
    infoText: z.string().max(2000).optional(),
  })
  .strict();

export const kitchenTicketPayload = z
  .object({
    kind: z.literal("KITCHEN_TICKET"),
    restaurantName: z.string().min(1).max(200),
    orderNumber: z.string().min(1).max(80),
    tableNumber: z.string().max(40).nullable().optional(),
    orderType: z.string().max(40),
    printedAtIso: z.string().min(1).max(80),
    lines: z.array(kitchenLine).max(200).optional(),
    orderKitchenNotes: z.string().max(4000).nullable().optional(),
    /** Kitchen routing — optional on wire; required for station-specific tickets at render time. */
    station: z.enum(["PIZZA", "PLATS", "SNACK", "CAFETERIA"]).optional(),
    waiterName: z.string().max(120).optional(),
    payloadVersion: z.literal(2).optional(),
    ticketMode: z.enum(["NEW", "UPDATE", "CANCEL", "INFO", "FULL_REPRINT"]).optional(),
    sections: z.array(kitchenDeltaSection).optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const isDelta = payload.payloadVersion === 2 && payload.sections && payload.sections.length > 0;
    if (isDelta) {
      const lineCount = payload.sections!.reduce((n, s) => n + s.lines.length, 0);
      if (lineCount < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Delta kitchen ticket must include at least one section line",
          path: ["sections"],
        });
      }
      return;
    }
    if (!payload.lines || payload.lines.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Kitchen ticket must include at least one line",
        path: ["lines"],
      });
    }
  });

export const customerReceiptLine = z
  .object({
    name: z.string().min(1).max(200),
    qty: z.coerce.number().int().min(1).max(999),
    unitPrice: z.string().max(40),
    lineTotal: z.string().max(40),
    modifiers: z.array(z.string().max(120)).optional(),
  })
  .strict();

export const customerReceiptPayload = z
  .object({
    kind: z.literal("CUSTOMER_RECEIPT"),
    restaurantName: z.string().min(1).max(200),
    addressLine: z.string().max(300).nullable().optional(),
    phoneLine: z.string().max(80).nullable().optional(),
    orderNumber: z.string().min(1).max(80),
    tableNumber: z.string().max(40).nullable().optional(),
    printedAtIso: z.string().min(1).max(80),
    lines: z.array(customerReceiptLine).min(1).max(300),
    subtotal: z.string().max(40),
    taxTotal: z.string().max(40),
    discountTotal: z.string().max(40),
    total: z.string().max(40),
    paymentMethod: z.string().max(40),
    amountPaid: z.string().max(40),
    changeGiven: z.string().max(40).nullable().optional(),
    cashTendered: z.string().max(40).nullable().optional(),
    qrPayload: z.string().max(2000).nullable().optional(),
    cashierName: z.string().max(120).nullable().optional(),
    openCashDrawerBeforeCut: z.boolean().optional(),
  })
  .strict();

export const shiftSummaryPayload = z
  .object({
    kind: z.literal("SHIFT_SUMMARY"),
    restaurantName: z.string().min(1).max(200),
    shiftLabel: z.string().min(1).max(120),
    openedAtIso: z.string().min(1).max(80),
    closedAtIso: z.string().max(80).nullable().optional(),
    cashierName: z.string().min(1).max(120),
    currencyCode: z.string().min(1).max(8),
    grossSales: z.string().max(40),
    cashSales: z.string().max(40),
    cardSales: z.string().max(40),
    transferSales: z.string().max(40),
    refundsTotal: z.string().max(40),
    expenseTotal: z.string().max(40),
    openingFloat: z.string().max(40),
    closingNote: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const expenseReceiptPayload = z
  .object({
    kind: z.literal("EXPENSE_RECEIPT"),
    restaurantName: z.string().min(1).max(200),
    expenseId: uuid,
    categoryName: z.string().min(1).max(120),
    amount: z.string().max(40),
    paymentMethod: z.string().max(40),
    description: z.string().min(1).max(2000),
    recordedBy: z.string().max(120).nullable().optional(),
    createdAtIso: z.string().min(1).max(80),
    shiftLabel: z.string().max(120).nullable().optional(),
  })
  .strict();

export const printPayload = z.union([
  tableTicketPayload,
  kitchenTicketPayload,
  customerReceiptPayload,
  shiftSummaryPayload,
  expenseReceiptPayload,
]);

export const enqueuePrintJobBody = z
  .object({
    kind: z.enum(["TABLE_TICKET", "KITCHEN_TICKET", "CUSTOMER_RECEIPT", "SHIFT_SUMMARY", "EXPENSE_RECEIPT"]),
    printerId: uuid.optional().nullable(),
    priority: z.coerce.number().int().min(0).max(100).optional().default(0),
    maxAttempts: z.coerce.number().int().min(1).max(20).optional().default(5),
    payload: z.unknown(),
  })
  .strict();

export const renderEscPosBody = enqueuePrintJobBody;

export const listPrintJobsQuery = z
  .object({
    status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).max(10000).optional().default(0),
  })
  .strict();

export const printJobIdParams = z.object({ jobId: uuid }).strict();

export const dequeuePrintBody = z
  .object({
    printerId: uuid.optional().nullable(),
    workerId: z.string().min(1).max(200),
  })
  .strict();

export const failPrintJobBody = z
  .object({
    error: z.string().min(1).max(2000),
    retry: z.coerce.boolean().optional().default(true),
  })
  .strict();

const kitchenStationValue = z.enum(["PIZZA", "PLATS", "SNACK", "CAFETERIA"]);

function assertKitchenStationForRole(
  role: "KITCHEN" | "CASHIER" | "RECEIPT",
  kitchenStation: unknown,
  ctx: z.RefinementCtx,
): void {
  if (role !== "KITCHEN" && kitchenStation != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "kitchenStation is only allowed for KITCHEN printers",
      path: ["kitchenStation"],
    });
  }
}

export const createPrinterBody = z
  .object({
    name: z.string().min(1).max(120),
    role: z.enum(["KITCHEN", "CASHIER", "RECEIPT"]),
    kitchenStation: kitchenStationValue.nullable().optional(),
    driver: z.string().max(40).optional().default("RAW_ESCPOS"),
    connectionJson: z.record(z.any()).optional(),
    paperWidthChars: z.coerce.number().int().min(24).max(64).optional().default(32),
    isDefault: z.coerce.boolean().optional().default(false),
    isActive: z.coerce.boolean().optional().default(true),
  })
  .strict()
  .superRefine((o, ctx) => {
    assertKitchenStationForRole(o.role, o.kitchenStation ?? null, ctx);
  });

export const printerIdParams = z.object({ printerId: uuid }).strict();

export const updatePrinterBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    role: z.enum(["KITCHEN", "CASHIER", "RECEIPT"]).optional(),
    kitchenStation: kitchenStationValue.nullable().optional(),
    driver: z.string().max(40).optional(),
    connectionJson: z.record(z.any()).optional(),
    paperWidthChars: z.coerce.number().int().min(24).max(64).optional(),
    isDefault: z.coerce.boolean().optional(),
    isActive: z.coerce.boolean().optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field is required" })
  .superRefine((o, ctx) => {
    if (o.kitchenStation !== undefined && o.role !== undefined) {
      assertKitchenStationForRole(o.role, o.kitchenStation, ctx);
    } else if (o.kitchenStation !== undefined && o.role === undefined) {
      // role checked in service against existing printer row
    } else if (o.role !== undefined) {
      assertKitchenStationForRole(o.role, null, ctx);
    }
  });
