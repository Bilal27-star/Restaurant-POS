import { EscPosBuilder } from "../escpos/builder.js";
import type { KitchenTicketDocument } from "../documents/types.js";

export function renderKitchenTicketEscPos(doc: KitchenTicketDocument, paperWidthChars: number): Uint8Array {
  const b = new EscPosBuilder(paperWidthChars).init().align(1).bold(true).sizeDouble().line("CUISINE").sizeNormal().bold(false).rule("=");
  b.align(0);
  b.bold(true).line(`# ${doc.orderNumber}`).bold(false);
  b.sizeDouble().line(`TABLE ${doc.tableNumber ?? "EMPORTER"}`).sizeNormal();
  b.line(`Type: ${doc.orderType}`);
  b.line(`Heure: ${doc.printedAtIso}`);
  if (doc.orderKitchenNotes) {
    b.blank(1).bold(true).line(`NOTE COMMANDE:`).bold(false).line(doc.orderKitchenNotes);
  }
  b.blank(1).rule("-");
  for (const ln of doc.lines) {
    b.bold(true).line(`${ln.qty}x ${ln.name}`).bold(false);
    for (const m of ln.modifiers) {
      b.line(`  + ${m.label}`);
    }
    for (const r of ln.removedIngredients) {
      b.line(`  SANS ${r}`);
    }
    if (ln.kitchenNotes) {
      b.line(`  NOTE: ${ln.kitchenNotes}`);
    }
    b.blank(1);
  }
  b.rule("=").line(doc.restaurantName).blank(2).feed(4).cutPartial();
  return b.build();
}
