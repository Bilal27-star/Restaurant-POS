import type { Prisma } from "@pos/database";

import type { KitchenDeltaTx } from "./kitchen-delta.repository.js";
import { KitchenDeltaRepository, persistSentKitchenSnapshot } from "./kitchen-delta.repository.js";
import type {
  KitchenDeltaLine,
  KitchenDispatchIntent,
  KitchenLastSentSnapshotV1,
  KitchenStationBundle,
} from "./kitchen-delta.types.js";
import { KitchenPrintIntentRepository } from "./kitchen-print-intent.repository.js";
import { resolveLineKitchenStation } from "./kitchen-delta-routing.js";
import { computeKitchenSnapshotHash, snapshotFromCurrentLine } from "./kitchen-snapshot.js";
import type { KitchenStation } from "@pos/database";

function auditSnapshotFromRemovedLine(line: KitchenDeltaLine): KitchenLastSentSnapshotV1 {
  return {
    v: 1,
    qty: line.previousQty ?? line.qty,
    modifiers: line.modifiersRemoved.map((label) => ({ modifierId: null, label, count: 1 })),
    removedIngredients: line.removedIngredients,
    kitchenNotes: line.kitchenNotes,
    nameSnapshot: line.nameSnapshot,
    kitchenStation: line.kitchenStation,
  };
}

export function collectPersistedLineIdsFromBundle(
  bundle: KitchenStationBundle,
  options?: { excludeRemoved?: boolean },
): string[] {
  const ids: string[] = [];
  for (const section of bundle.sections) {
    if (options?.excludeRemoved && section.kind === "REMOVED") {
      continue;
    }
    for (const line of section.lines) {
      ids.push(line.orderItemId);
    }
  }
  return ids;
}

export async function applySentUpdatesForStationBundle(
  deps: {
    kitchenRepo: KitchenDeltaRepository;
    intentRepo: KitchenPrintIntentRepository;
  },
  tx: KitchenDeltaTx,
  input: {
    restaurantId: string;
    orderId: string;
    intentId: string;
    bundle: KitchenStationBundle;
    station: KitchenStation;
    ticketMode: KitchenDispatchIntent["ticketMode"];
  },
): Promise<void> {
  const sentAt = new Date();

  for (const section of input.bundle.sections) {
    for (const deltaLine of section.lines) {
      if (section.kind === "REMOVED") {
        await deps.intentRepo.appendAuditEntry(tx, {
          restaurantId: input.restaurantId,
          orderId: input.orderId,
          orderItemId: deltaLine.orderItemId,
          event: "REMOVED",
          snapshotJson: auditSnapshotFromRemovedLine(deltaLine) as unknown as Prisma.InputJsonValue,
          intentId: input.intentId,
        });
        continue;
      }

      const row = await deps.kitchenRepo.loadKitchenDetectLine(
        tx,
        input.restaurantId,
        input.orderId,
        deltaLine.orderItemId,
      );
      if (!row) {
        continue;
      }

      const stationResolved =
        row.kitchenStation ?? resolveLineKitchenStation(row) ?? input.station;
      const snapshot = snapshotFromCurrentLine(row, stationResolved);
      const snapshotHash = computeKitchenSnapshotHash(snapshot);

      await persistSentKitchenSnapshot(
        tx,
        deltaLine.orderItemId,
        snapshot,
        snapshotHash,
        input.station,
        sentAt,
      );

      const auditEvent =
        section.kind === "MODIFIED"
          ? "MODIFIED"
          : input.ticketMode === "FULL_REPRINT"
            ? "FULL_REPRINT"
            : "SENT";

      await deps.intentRepo.appendAuditEntry(tx, {
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        orderItemId: deltaLine.orderItemId,
        event: auditEvent,
        snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        intentId: input.intentId,
      });
    }
  }
}

export async function markBundleLinesPrintFailed(
  tx: KitchenDeltaTx,
  bundle: KitchenStationBundle,
): Promise<string[]> {
  const updated: string[] = [];
  for (const section of bundle.sections) {
    if (section.kind === "REMOVED") {
      continue;
    }
    for (const line of section.lines) {
      const result = await tx.orderItem.updateMany({
        where: {
          id: line.orderItemId,
          kitchenStatus: { in: ["PENDING", "MODIFIED", "SENT", "PRINT_FAILED"] },
        },
        data: { kitchenStatus: "PRINT_FAILED" },
      });
      if (result.count > 0) {
        updated.push(line.orderItemId);
      }
    }
  }
  return updated;
}
