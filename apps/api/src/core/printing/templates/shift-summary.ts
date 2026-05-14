import { EscPosBuilder } from "../escpos/builder.js";
import type { ShiftSummaryDocument } from "../documents/types.js";

export function renderShiftSummaryEscPos(doc: ShiftSummaryDocument, paperWidthChars: number): Uint8Array {
  const b = new EscPosBuilder(paperWidthChars).init().align(1).bold(true).line("SHIFT SUMMARY").bold(false).rule("=");
  b.align(0);
  b.line(doc.restaurantName);
  b.line(doc.shiftLabel);
  b.rowLR("Cashier", doc.cashierName);
  b.rowLR("Opened", doc.openedAtIso);
  b.rowLR("Closed", doc.closedAtIso ?? "—");
  b.blank(1).rule("-");
  b.bold(true).line("Revenue").bold(false);
  b.rowLR(`Gross (${doc.currencyCode})`, doc.grossSales);
  b.rowLR("Cash", doc.cashSales);
  b.rowLR("Card", doc.cardSales);
  b.rowLR("Transfer", doc.transferSales);
  b.rowLR("Refunds", doc.refundsTotal);
  b.rowLR("Expenses", doc.expenseTotal);
  b.blank(1).rule("-");
  b.rowLR("Opening float", doc.openingFloat);
  if (doc.closingNote) {
    b.blank(1).line(doc.closingNote);
  }
  b.blank(2).feed(3).cutPartial();
  return b.build();
}
