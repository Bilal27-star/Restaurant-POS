import { EscPosBuilder } from "../escpos/builder.js";
import type { ExpenseReceiptDocument } from "../documents/types.js";

export function renderExpenseReceiptEscPos(doc: ExpenseReceiptDocument, paperWidthChars: number): Uint8Array {
  const b = new EscPosBuilder(paperWidthChars).init().align(1).bold(true).line("EXPENSE").bold(false).rule("=");
  b.align(0);
  b.line(doc.restaurantName);
  b.rowLR("ID", doc.expenseId.slice(0, 8));
  b.rowLR("Category", doc.categoryName);
  b.rowLR("Amount", doc.amount);
  b.rowLR("Method", doc.paymentMethod);
  b.blank(1).line(doc.description);
  b.blank(1).rowLR("Recorded", doc.recordedBy ?? "—");
  b.rowLR("When", doc.createdAtIso);
  if (doc.shiftLabel) {
    b.rowLR("Shift", doc.shiftLabel);
  }
  b.blank(2).feed(3).cutPartial();
  return b.build();
}
