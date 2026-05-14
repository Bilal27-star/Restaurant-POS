import { EscPosBuilder } from "../escpos/builder.js";
import type { CustomerReceiptDocument } from "../documents/types.js";

export function renderCustomerReceiptEscPos(doc: CustomerReceiptDocument, paperWidthChars: number): Uint8Array {
  const b = new EscPosBuilder(paperWidthChars).init().align(1).bold(true).line(doc.restaurantName).bold(false);
  if (doc.addressLine) b.line(doc.addressLine);
  if (doc.phoneLine) b.line(doc.phoneLine);
  b.rule("=").align(0);
  b.rowLR("Commande", doc.orderNumber);
  if (doc.tableNumber) b.rowLR("Table", doc.tableNumber);
  b.rowLR("Date", doc.printedAtIso);
  if (doc.cashierName) {
    b.rowLR("Caissier", doc.cashierName);
  }
  b.blank(1).rule("-");
  for (const it of doc.lines) {
    b.bold(true).line(`${it.qty}x ${it.name}`).bold(false);
    if (it.modifiers?.length) {
      for (const m of it.modifiers) {
        b.line(`  + ${m}`);
      }
    }
    b.rowLR(" ", `${it.lineTotal}`);
  }
  b.rule("-");
  b.rowLR("Sous-total", doc.subtotal);
  b.rowLR("TVA", doc.taxTotal);
  b.rowLR("Remise", doc.discountTotal);
  b.bold(true).rowLR("TOTAL", doc.total).bold(false);
  b.blank(1);
  b.rowLR("Paiement", doc.paymentMethod);
  b.rowLR("Montant", doc.amountPaid);
  if (doc.cashTendered) {
    b.rowLR("Reçu", doc.cashTendered);
  }
  if (doc.changeGiven) {
    b.rowLR("Rendu", doc.changeGiven);
  }
  if (doc.qrPayload) {
    b.blank(1).align(1);
    try {
      b.qrModel2(doc.qrPayload);
    } catch {
      b.line("Réf.:");
      b.line(doc.qrPayload.slice(0, paperWidthChars * 2));
    }
    b.align(0);
  }
  b.blank(2).line("Merci");
  if (doc.openCashDrawerBeforeCut) {
    b.openCashDrawer(0, 60, 120);
  }
  b.feed(3).cutPartial();
  return b.build();
}
