import type {
  KitchenDeltaLine,
  KitchenDetectContext,
  KitchenDetectLine,
  KitchenDispatchIntent,
} from "./kitchen-delta.types.js";
import {
  attachStationToLines,
  buildStationBundles,
  resolveLineKitchenStation,
  validateBundlesAtPreflight,
} from "./kitchen-delta-routing.js";
import {
  computeKitchenSnapshotHash,
  diffModifierLabels,
  diffStringArrays,
  parseKitchenLastSentSnapshot,
  snapshotFromCurrentLine,
  sortedStringArrayFromUnknown,
} from "./kitchen-snapshot.js";

function baseIntentFields(ctx: KitchenDetectContext): Omit<KitchenDispatchIntent, "ticketMode" | "stationBundles"> {
  return {
    payloadVersion: 2,
    mutationKind: ctx.mutationKind,
    clientMutationId: ctx.clientMutationId,
    orderId: ctx.orderId,
    orderNumber: ctx.orderNumber,
    tableNumber: ctx.tableNumber,
    orderType: ctx.orderType,
    waiterName: ctx.waiterName,
    orderKitchenNotes: ctx.kitchenNotes,
  };
}

function toAddedLine(line: KitchenDetectLine): KitchenDeltaLine {
  const station = resolveLineKitchenStation(line);
  return {
    orderItemId: line.id,
    nameSnapshot: line.nameSnapshot,
    qty: line.quantity,
    modifiersAdded: line.modifiers.map((m) => m.label),
    modifiersRemoved: [],
    removedIngredients: sortedStringArrayFromUnknown(line.removedIngredients),
    removedIngredientsAdded: [],
    kitchenNotes: line.kitchenNotes,
    kitchenStation: station,
  };
}

function buildUpdateDeltaLine(before: KitchenDetectLine, after: KitchenDetectLine): KitchenDeltaLine | null {
  const station = resolveLineKitchenStation(after);
  const beforeSnap =
    parseKitchenLastSentSnapshot(before.kitchenLastSentSnapshot) ??
    snapshotFromCurrentLine(before, resolveLineKitchenStation(before));
  const afterSnap = snapshotFromCurrentLine(after, station);
  const afterHash = computeKitchenSnapshotHash(afterSnap);
  if (before.kitchenSnapshotHash && before.kitchenSnapshotHash === afterHash) {
    return null;
  }
  if (computeKitchenSnapshotHash(beforeSnap) === afterHash) {
    return null;
  }

  const modDiff = diffModifierLabels(beforeSnap.modifiers, afterSnap.modifiers);
  const sansDiff = diffStringArrays(beforeSnap.removedIngredients, afterSnap.removedIngredients);

  return {
    orderItemId: after.id,
    nameSnapshot: after.nameSnapshot,
    qty: after.quantity,
    previousQty: beforeSnap.qty,
    deltaQty: after.quantity - beforeSnap.qty,
    modifiersAdded: modDiff.added,
    modifiersRemoved: modDiff.removed,
    removedIngredients: afterSnap.removedIngredients,
    removedIngredientsAdded: sansDiff.added,
    kitchenNotes: after.kitchenNotes,
    previousKitchenNotes: beforeSnap.kitchenNotes,
    kitchenStation: station,
  };
}

function buildRemovedLine(line: KitchenDetectLine): KitchenDeltaLine {
  const snap =
    parseKitchenLastSentSnapshot(line.kitchenLastSentSnapshot) ??
    snapshotFromCurrentLine(line, resolveLineKitchenStation(line));
  const station = line.kitchenStation ?? snap.kitchenStation ?? resolveLineKitchenStation(line);
  return {
    orderItemId: line.id,
    nameSnapshot: line.nameSnapshot,
    qty: snap.qty,
    previousQty: snap.qty,
    deltaQty: -snap.qty,
    modifiersAdded: [],
    modifiersRemoved: snap.modifiers.map((m) => m.label),
    removedIngredients: snap.removedIngredients,
    removedIngredientsAdded: [],
    kitchenNotes: snap.kitchenNotes,
    kitchenStation: station,
  };
}

function finalizeIntent(
  ctx: KitchenDetectContext,
  ticketMode: KitchenDispatchIntent["ticketMode"],
  bundles: ReturnType<typeof attachStationToLines>,
): KitchenDispatchIntent | null {
  if (bundles.length === 0) return null;
  return {
    ...baseIntentFields(ctx),
    ticketMode,
    stationBundles: bundles,
  };
}

function detectCreate(ctx: KitchenDetectContext & { mutationKind: "CREATE" }): KitchenDispatchIntent | null {
  const lineSections = ctx.lines.map((line) => ({
    line,
    section: { kind: "ADDED" as const, lines: [toAddedLine(line)] },
  }));
  const { bundles, unrouted } = buildStationBundles(lineSections, []);
  const routing = validateBundlesAtPreflight(bundles, unrouted);
  if (!routing.ok) {
    throw new KitchenUnroutedLinesError(routing.unroutedLines);
  }
  return finalizeIntent(ctx, "NEW", attachStationToLines(bundles));
}

function detectLineAdd(ctx: KitchenDetectContext & { mutationKind: "LINE_ADD"; addedLineIds: string[] }): KitchenDispatchIntent | null {
  const idSet = new Set(ctx.addedLineIds);
  const added = ctx.lines.filter((l) => idSet.has(l.id));
  if (added.length === 0) return null;
  const lineSections = added.map((line) => ({
    line,
    section: { kind: "ADDED" as const, lines: [toAddedLine(line)] },
  }));
  const { bundles, unrouted } = buildStationBundles(lineSections, []);
  const routing = validateBundlesAtPreflight(bundles, unrouted);
  if (!routing.ok) {
    throw new KitchenUnroutedLinesError(routing.unroutedLines);
  }
  return finalizeIntent(ctx, "NEW", attachStationToLines(bundles));
}

function detectLineUpdate(
  ctx: KitchenDetectContext & { mutationKind: "LINE_UPDATE"; lineId: string; beforeLine: KitchenDetectLine },
): KitchenDispatchIntent | null {
  const after = ctx.lines.find((l) => l.id === ctx.lineId);
  if (!after) return null;

  if (after.kitchenStatus === "PENDING") {
    return null;
  }

  const deltaLine = buildUpdateDeltaLine(ctx.beforeLine, after);
  if (!deltaLine) {
    return null;
  }

  const lineSections = [{ line: after, section: { kind: "MODIFIED" as const, lines: [deltaLine] } }];
  const { bundles, unrouted } = buildStationBundles(lineSections, []);
  const routing = validateBundlesAtPreflight(bundles, unrouted);
  if (!routing.ok) {
    throw new KitchenUnroutedLinesError(routing.unroutedLines);
  }
  return finalizeIntent(ctx, "UPDATE", attachStationToLines(bundles));
}

function detectLineDelete(
  ctx: KitchenDetectContext & { mutationKind: "LINE_DELETE"; deletedLine: KitchenDetectLine },
): KitchenDispatchIntent | null {
  const line = ctx.deletedLine;
  if (line.kitchenStatus === "PENDING") {
    return null;
  }

  const removed = buildRemovedLine(line);
  const lineSections = [{ line, section: { kind: "REMOVED" as const, lines: [removed] } }];
  const { bundles, unrouted } = buildStationBundles(lineSections, []);
  const routing = validateBundlesAtPreflight(bundles, unrouted);
  if (!routing.ok) {
    throw new KitchenUnroutedLinesError(routing.unroutedLines);
  }
  return finalizeIntent(ctx, "CANCEL", attachStationToLines(bundles));
}

function lineBeforeFromLastSent(after: KitchenDetectLine): KitchenDetectLine {
  const snap = parseKitchenLastSentSnapshot(after.kitchenLastSentSnapshot);
  if (!snap) {
    return after;
  }
  return {
    ...after,
    quantity: snap.qty,
    kitchenNotes: snap.kitchenNotes,
    nameSnapshot: snap.nameSnapshot,
    removedIngredients: snap.removedIngredients,
    kitchenStation: snap.kitchenStation ?? after.kitchenStation,
    modifiers: snap.modifiers.flatMap((m) =>
      Array.from({ length: m.count }, () => ({
        modifierId: m.modifierId,
        label: m.label,
      })),
    ),
  };
}

function detectDispatchPending(
  ctx: KitchenDetectContext & { mutationKind: "DISPATCH_PENDING"; removedLines: KitchenDetectLine[] },
): KitchenDispatchIntent | null {
  const lineSections: { line: KitchenDetectLine; section: { kind: "MODIFIED" | "REMOVED"; lines: KitchenDeltaLine[] } }[] =
    [];

  for (const after of ctx.lines) {
    if (after.kitchenStatus !== "MODIFIED") continue;
    const before = lineBeforeFromLastSent(after);
    const deltaLine = buildUpdateDeltaLine(before, after);
    if (!deltaLine) continue;
    lineSections.push({ line: after, section: { kind: "MODIFIED", lines: [deltaLine] } });
  }

  for (const line of ctx.removedLines) {
    lineSections.push({ line, section: { kind: "REMOVED", lines: [buildRemovedLine(line)] } });
  }

  if (lineSections.length === 0) {
    return null;
  }

  const hasModified = lineSections.some((s) => s.section.kind === "MODIFIED");
  const hasRemoved = lineSections.some((s) => s.section.kind === "REMOVED");
  const ticketMode = hasRemoved && !hasModified ? "CANCEL" : "UPDATE";

  const { bundles, unrouted } = buildStationBundles(lineSections, []);
  const routing = validateBundlesAtPreflight(bundles, unrouted);
  if (!routing.ok) {
    throw new KitchenUnroutedLinesError(routing.unroutedLines);
  }
  return finalizeIntent(ctx, ticketMode, attachStationToLines(bundles));
}

function detectFullReprint(
  ctx: KitchenDetectContext & { mutationKind: "FULL_REPRINT"; lineIds?: string[] },
): KitchenDispatchIntent | null {
  const idSet = ctx.lineIds && ctx.lineIds.length > 0 ? new Set(ctx.lineIds) : null;
  const eligible = ctx.lines.filter((line) => {
    if (idSet && !idSet.has(line.id)) {
      return false;
    }
    return line.kitchenStatus !== "PENDING";
  });

  if (eligible.length === 0) {
    return null;
  }

  const lineSections = eligible.map((line) => ({
    line,
    section: { kind: "ADDED" as const, lines: [toAddedLine(line)] },
  }));
  const { bundles, unrouted } = buildStationBundles(lineSections, []);
  const routing = validateBundlesAtPreflight(bundles, unrouted);
  if (!routing.ok) {
    throw new KitchenUnroutedLinesError(routing.unroutedLines);
  }
  return finalizeIntent(ctx, "FULL_REPRINT", attachStationToLines(bundles));
}

function detectOrderInfo(
  ctx: KitchenDetectContext & { mutationKind: "ORDER_INFO"; previousKitchenNotes: string | null },
): KitchenDispatchIntent | null {
  const next = ctx.kitchenNotes?.trim() ?? "";
  const prev = ctx.previousKitchenNotes?.trim() ?? "";
  if (next === prev) return null;

  // INFO station list resolved at dispatch (Phase 3); Phase 1 detector emits empty bundles placeholder.
  return null;
}

/** Thrown during preflight when routing fails — maps to HTTP 422. */
export class KitchenUnroutedLinesError extends Error {
  readonly code = "KITCHEN_UNROUTED_LINES" as const;

  constructor(readonly unroutedLines: { orderItemId: string | null; nameSnapshot: string }[]) {
    super("One or more items cannot be routed to a kitchen station.");
    this.name = "KitchenUnroutedLinesError";
  }
}

/**
 * Phase 0 preflight detector — pure, read-only.
 * Returns null when no printable delta; throws KitchenUnroutedLinesError on unrouted lines.
 */
export function detectKitchenDispatchIntent(ctx: KitchenDetectContext): KitchenDispatchIntent | null {
  switch (ctx.mutationKind) {
    case "CREATE":
      return detectCreate(ctx);
    case "LINE_ADD":
      return detectLineAdd(ctx);
    case "LINE_UPDATE":
      return detectLineUpdate(ctx);
    case "LINE_DELETE":
      return detectLineDelete(ctx);
    case "DISPATCH_PENDING":
      return detectDispatchPending(ctx);
    case "ORDER_INFO":
      return detectOrderInfo(ctx);
    case "FULL_REPRINT":
      return detectFullReprint(ctx);
    default:
      return null;
  }
}

/** Whether a line update produces no kitchen ticket (empty diff or PENDING line). */
export function isKitchenLineUpdateSuppressed(before: KitchenDetectLine, after: KitchenDetectLine): boolean {
  if (after.kitchenStatus === "PENDING") return true;
  return buildUpdateDeltaLine(before, after) === null;
}
