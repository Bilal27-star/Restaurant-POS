import { EscPosBuilder } from "../escpos/builder.js";
import type { TableTicketDocument } from "../documents/types.js";

export function renderTableTicketEscPos(doc: TableTicketDocument, paperWidthChars: number): Uint8Array {
  const b = new EscPosBuilder(paperWidthChars).init().align(1).bold(true).line(doc.restaurantName).bold(false).rule("=");
  b.align(0);
  b.sizeDouble().line(`TABLE ${doc.tableNumber}`).sizeNormal();
  b.line(`Order: ${doc.orderNumber}`);
  b.line(`Waiter: ${doc.waiterName}`);
  b.line(`Time: ${doc.printedAtIso}`);
  if (doc.referenceCode) {
    b.blank(1).align(1).bold(true).line(`CODE ${doc.referenceCode}`).bold(false).align(0);
  }
  if (doc.qrPayload) {
    b.blank(1).align(1);
    try {
      b.qrModel2(doc.qrPayload);
    } catch {
      b.line("QR:");
      b.line(doc.qrPayload.slice(0, paperWidthChars * 3));
    }
    b.align(0);
  }
  b.blank(1).rule("=");
  b.line(doc.footerNote ?? "Ticket identification — not an invoice");
  b.blank(2).feed(3).cutPartial();
  return b.build();
}
