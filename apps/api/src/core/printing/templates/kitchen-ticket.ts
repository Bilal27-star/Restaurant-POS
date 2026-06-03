import { EscPosBuilder } from "../escpos/builder.js";
import type { KitchenTicketDocument, KitchenTicketLine, KitchenTicketSectionKind } from "../documents/types.js";

function sectionHeader(kind: KitchenTicketSectionKind): string {
  switch (kind) {
    case "ADDED":
      return "NOUVEAU";
    case "MODIFIED":
      return "AJUSTEMENT";
    case "REMOVED":
      return "ANNULE";
    case "INFO":
      return "INFO";
    default:
      return kind;
  }
}

function ticketModeBanner(mode: KitchenTicketDocument["ticketMode"]): string {
  switch (mode) {
    case "NEW":
      return "NOUVEAU";
    case "UPDATE":
      return "MODIFICATION";
    case "CANCEL":
      return "ANNULATION";
    case "INFO":
      return "INFO COMMANDE";
    case "FULL_REPRINT":
      return "REIMPRESSION";
    default:
      return "KITCHEN TICKET";
  }
}

function splitKitchenNoteLines(notes: string): string[] {
  return notes
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Highlighted per-line kitchen note block (supports multiple lines in one note field). */
function renderKitchenNotesBlock(b: EscPosBuilder, notes: string): void {
  const parts = splitKitchenNoteLines(notes);
  if (parts.length === 0) return;
  b.bold(true).line("*** NOTE CUISINE ***").bold(false);
  for (const part of parts) {
    b.line(`  ${part}`);
  }
}

function isNoteOnlyModification(ln: KitchenTicketLine): boolean {
  const noteChanged =
    Boolean(ln.previousKitchenNotes?.trim()) &&
    ln.previousKitchenNotes?.trim() !== (ln.kitchenNotes?.trim() ?? "");
  const qtyUnchanged = ln.deltaQty == null || ln.deltaQty === 0;
  const noModDiff =
    (ln.modifiersAdded?.length ?? 0) === 0 &&
    (ln.modifiersRemoved?.length ?? 0) === 0 &&
    (ln.removedIngredientsAdded?.length ?? 0) === 0;
  return noteChanged && qtyUnchanged && noModDiff;
}

function renderNoteChangeUpdate(b: EscPosBuilder, ln: KitchenTicketLine): void {
  b.bold(true).line("UPDATE").bold(false);
  b.blank(1);
  b.bold(true).line(ln.name).bold(false);
  b.blank(1);
  if (ln.previousKitchenNotes?.trim()) {
    b.bold(true).line("OLD NOTE:").bold(false);
    for (const part of splitKitchenNoteLines(ln.previousKitchenNotes)) {
      b.line(`  ${part}`);
    }
    b.blank(1);
  }
  if (ln.kitchenNotes?.trim()) {
    b.bold(true).line("NEW NOTE:").bold(false);
    for (const part of splitKitchenNoteLines(ln.kitchenNotes)) {
      b.line(`  ${part}`);
    }
  }
}

function renderDeltaLine(b: EscPosBuilder, sectionKind: KitchenTicketSectionKind, ln: KitchenTicketLine): void {
  if (sectionKind === "MODIFIED" && isNoteOnlyModification(ln)) {
    renderNoteChangeUpdate(b, ln);
    b.blank(1);
    return;
  }

  if (sectionKind === "REMOVED") {
    b.bold(true).line(`X ${ln.name} x${ln.qty}`).bold(false);
  } else if (sectionKind === "MODIFIED" && ln.deltaQty != null && ln.deltaQty !== 0) {
    const sign = ln.deltaQty > 0 ? "+" : "";
    b.bold(true).line(`${sign}${ln.deltaQty} ${ln.name} (total x${ln.qty})`).bold(false);
    if (ln.previousQty != null && ln.previousQty !== ln.qty) {
      b.line(`  etait: x${ln.previousQty}`);
    }
  } else {
    b.bold(true).line(`${ln.qty}x ${ln.name}`).bold(false);
  }

  for (const m of ln.modifiers) {
    b.line(`  ${m.label.startsWith("+") || m.label.startsWith("-") ? m.label : `+ ${m.label}`}`);
  }
  for (const r of ln.removedIngredients) {
    b.line(`  SANS ${r}`);
  }
  for (const r of ln.removedIngredientsAdded ?? []) {
    b.line(`  SANS ${r} (ajout)`);
  }
  if (ln.kitchenNotes?.trim()) {
    renderKitchenNotesBlock(b, ln.kitchenNotes);
  }
  if (
    sectionKind === "MODIFIED" &&
    ln.previousKitchenNotes?.trim() &&
    ln.previousKitchenNotes.trim() !== (ln.kitchenNotes?.trim() ?? "") &&
    !isNoteOnlyModification(ln)
  ) {
    b.bold(true).line("OLD NOTE:").bold(false);
    for (const part of splitKitchenNoteLines(ln.previousKitchenNotes)) {
      b.line(`  ${part}`);
    }
    if (ln.kitchenNotes?.trim()) {
      b.bold(true).line("NEW NOTE:").bold(false);
      for (const part of splitKitchenNoteLines(ln.kitchenNotes)) {
        b.line(`  ${part}`);
      }
    }
  }
  b.blank(1);
}

function renderDeltaSections(b: EscPosBuilder, doc: KitchenTicketDocument): void {
  for (const section of doc.sections ?? []) {
    b.bold(true).line(`--- ${sectionHeader(section.kind)} ---`).bold(false);
    if (section.infoText) {
      b.line(section.infoText);
      b.blank(1);
    }
    for (const ln of section.lines) {
      renderDeltaLine(b, section.kind, ln);
    }
  }
}

function renderLegacyLines(b: EscPosBuilder, lines: KitchenTicketLine[]): void {
  for (const ln of lines) {
    b.bold(true).line(`${ln.qty}x ${ln.name}`).bold(false);
    for (const m of ln.modifiers) {
      b.line(`  + ${m.label}`);
    }
    for (const r of ln.removedIngredients) {
      b.line(`  SANS ${r}`);
    }
    if (ln.kitchenNotes?.trim()) {
      renderKitchenNotesBlock(b, ln.kitchenNotes);
    }
    b.blank(1);
  }
}

export function renderKitchenTicketEscPos(doc: KitchenTicketDocument, paperWidthChars: number): Uint8Array {
  const b = new EscPosBuilder(paperWidthChars).init();
  const isDelta = doc.payloadVersion === 2 && doc.sections && doc.sections.length > 0;
  const title = isDelta ? ticketModeBanner(doc.ticketMode) : doc.station ? "KITCHEN TICKET" : "CUISINE";

  if (doc.station || isDelta) {
    b.align(1).bold(true).sizeDouble().line(title).sizeNormal().bold(false).rule("=");
    b.align(0);
    b.bold(true);
    b.line(`Table: ${doc.tableNumber ?? "EMPORTER"}`);
    b.line(`Order: #${doc.orderNumber}`);
    if (doc.station) {
      b.line(`Station: ${doc.station}`);
    }
    if (doc.waiterName) {
      b.line(`Serveur: ${doc.waiterName}`);
    }
    b.line(`Heure: ${doc.printedAtIso}`);
    b.bold(false).blank(1).rule("-");
    if (doc.orderKitchenNotes?.trim()) {
      b.bold(true).line("NOTE COMMANDE:").bold(false);
      for (const part of splitKitchenNoteLines(doc.orderKitchenNotes)) {
        b.line(part);
      }
      b.blank(1);
    }
    if (isDelta) {
      renderDeltaSections(b, doc);
    } else {
      b.line("Items:").blank(1);
      renderLegacyLines(b, doc.lines);
    }
  } else {
    b.align(1).bold(true).sizeDouble().line("CUISINE").sizeNormal().bold(false).rule("=");
    b.align(0);
    b.bold(true).line(`# ${doc.orderNumber}`).bold(false);
    b.sizeDouble().line(`TABLE ${doc.tableNumber ?? "EMPORTER"}`).sizeNormal();
    b.line(`Type: ${doc.orderType}`);
    b.line(`Heure: ${doc.printedAtIso}`);
    if (doc.orderKitchenNotes?.trim()) {
      b.blank(1).bold(true).line("NOTE COMMANDE:").bold(false);
      for (const part of splitKitchenNoteLines(doc.orderKitchenNotes)) {
        b.line(part);
      }
    }
    b.blank(1).rule("-");
    renderLegacyLines(b, doc.lines);
  }
  b.rule("=").line(doc.restaurantName).blank(2).feed(4).cutPartial();
  return b.build();
}
