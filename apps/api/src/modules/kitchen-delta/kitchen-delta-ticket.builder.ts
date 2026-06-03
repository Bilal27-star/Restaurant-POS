import type { KitchenTicketDocument, KitchenTicketLine, KitchenTicketSection } from "../../core/printing/documents/types.js";
import type { KitchenDeltaLine, KitchenDispatchIntent, KitchenStationBundle } from "./kitchen-delta.types.js";

function deltaLineToTicketLine(line: KitchenDeltaLine, sectionKind: KitchenTicketSection["kind"]): KitchenTicketLine {
  const modifiers =
    sectionKind === "ADDED"
      ? line.modifiersAdded.map((label) => ({ label }))
      : sectionKind === "MODIFIED"
        ? [
            ...line.modifiersAdded.map((label) => ({ label: `+ ${label}` })),
            ...line.modifiersRemoved.map((label) => ({ label: `- ${label}` })),
          ]
        : line.modifiersRemoved.map((label) => ({ label }));

  return {
    qty: sectionKind === "REMOVED" ? (line.previousQty ?? line.qty) : line.qty,
    name: line.nameSnapshot,
    modifiers,
    removedIngredients: line.removedIngredients,
    kitchenNotes: line.kitchenNotes,
    previousQty: line.previousQty,
    deltaQty: line.deltaQty,
    modifiersAdded: line.modifiersAdded,
    modifiersRemoved: line.modifiersRemoved,
    removedIngredientsAdded: line.removedIngredientsAdded,
    previousKitchenNotes: line.previousKitchenNotes,
  };
}

function bundleToSections(bundle: KitchenStationBundle): KitchenTicketSection[] {
  return bundle.sections.map((section) => ({
    kind: section.kind,
    lines: section.lines.map((line) => deltaLineToTicketLine(line, section.kind)),
    infoText: section.infoText,
  }));
}

/** Build wire payload for `enqueueKitchenStationJob` from frozen intent + station bundle. */
export function buildKitchenDeltaTicketPayload(
  intent: KitchenDispatchIntent,
  bundle: KitchenStationBundle,
  restaurantName: string,
): KitchenTicketDocument {
  const sections = bundleToSections(bundle);
  const lines = sections.flatMap((s) => s.lines);

  return {
    kind: "KITCHEN_TICKET",
    payloadVersion: 2,
    ticketMode: intent.ticketMode,
    restaurantName,
    orderNumber: intent.orderNumber,
    tableNumber: intent.tableNumber,
    orderType: intent.orderType,
    printedAtIso: new Date().toISOString(),
    orderKitchenNotes: intent.orderKitchenNotes,
    station: bundle.station,
    waiterName: intent.waiterName ?? undefined,
    sections,
    lines,
  };
}

export function extractKitchenDeltaItemNames(bundle: KitchenStationBundle): string[] {
  const names: string[] = [];
  for (const section of bundle.sections) {
    for (const line of section.lines) {
      names.push(line.nameSnapshot);
    }
  }
  return names;
}

export function summarizeKitchenDeltaStation(bundle: KitchenStationBundle): string {
  const parts: string[] = [];
  for (const section of bundle.sections) {
    parts.push(`${section.kind}:${section.lines.length}`);
  }
  return parts.join(", ");
}
