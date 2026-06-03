import type { Prisma } from "@pos/database";

import { prisma } from "../../prisma/index.js";
import {
  collectPersistedLineIdsFromBundle,
  markBundleLinesPrintFailed,
} from "./kitchen-delta-line-updates.js";
import type { KitchenStationBundle } from "./kitchen-delta.types.js";
import { KitchenPrintIntentRepository } from "./kitchen-print-intent.repository.js";
import { KitchenDeltaRepository } from "./kitchen-delta.repository.js";
import { snapshotFromCurrentLine } from "./kitchen-snapshot.js";
import { resolveLineKitchenStation } from "./kitchen-delta-routing.js";

export type KitchenPrintFailureResult = {
  handled: boolean;
  intentId: string | null;
  intentStatus: string | null;
  station: string | null;
  printFailedLineIds: string[];
};

function parseStationBundle(payloadJson: unknown): KitchenStationBundle {
  return payloadJson as KitchenStationBundle;
}

/**
 * Phase 2.5 — PrintJob terminal failure hook (spec §13.2).
 * Lines stay SENT during worker retries; transition to PRINT_FAILED only when job is terminal.
 */
export class KitchenPrintFailureService {
  private readonly intentRepo = new KitchenPrintIntentRepository();
  private readonly kitchenRepo = new KitchenDeltaRepository();

  async handleTerminalPrintJobFailure(
    restaurantId: string,
    jobId: string,
    error: string,
  ): Promise<KitchenPrintFailureResult> {
    const stationRow = await prisma.kitchenPrintIntentStation.findFirst({
      where: { printJobId: jobId, intent: { restaurantId } },
      include: { intent: { select: { id: true, orderId: true, restaurantId: true } } },
    });

    if (!stationRow) {
      return {
        handled: false,
        intentId: null,
        intentStatus: null,
        station: null,
        printFailedLineIds: [],
      };
    }

    const bundle = parseStationBundle(stationRow.payloadJson);
    const printFailedLineIds = await prisma.$transaction(async (tx) => {
      await this.intentRepo.getIntentForUpdate(tx, stationRow.intentId);
      await this.intentRepo.markStationFailed(tx, stationRow.id, error);
      const failedIds = await markBundleLinesPrintFailed(tx, bundle);

      for (const orderItemId of failedIds) {
        const row = await this.kitchenRepo.loadKitchenDetectLine(
          tx,
          restaurantId,
          stationRow.intent.orderId,
          orderItemId,
        );
        const snapshot =
          row != null
            ? snapshotFromCurrentLine(row, row.kitchenStation ?? resolveLineKitchenStation(row))
            : null;

        await this.intentRepo.appendAuditEntry(tx, {
          restaurantId,
          orderId: stationRow.intent.orderId,
          orderItemId,
          event: "PRINT_FAILED",
          snapshotJson: (snapshot ?? { v: 1, reason: "print_job_terminal_failure", error }) as unknown as Prisma.InputJsonValue,
          intentId: stationRow.intentId,
        });
      }

      await this.intentRepo.syncParentIntentStatus(tx, stationRow.intentId, stationRow.intent.orderId);
      return failedIds;
    });

    const finalIntent = await prisma.kitchenPrintIntent.findUnique({
      where: { id: stationRow.intentId },
      select: { status: true },
    });

    console.warn("[KITCHEN_DELTA_PRINT_FAILED]", {
      intentId: stationRow.intentId,
      orderId: stationRow.intent.orderId,
      station: stationRow.station,
      printJobId: jobId,
      error,
      printFailedLineIds,
      intentStatus: finalIntent?.status ?? null,
      affectedLineCount: collectPersistedLineIdsFromBundle(bundle, { excludeRemoved: true }).length,
    });

    return {
      handled: true,
      intentId: stationRow.intentId,
      intentStatus: finalIntent?.status ?? null,
      station: stationRow.station,
      printFailedLineIds,
    };
  }

  /** Non-terminal worker retry — lines remain SENT (spec §13.1 / A13). */
  logPrintJobRetry(restaurantId: string, jobId: string, error: string, attempt: number): void {
    console.info("[KITCHEN_DELTA_PRINT_RETRY]", {
      restaurantId,
      printJobId: jobId,
      error,
      attempt,
    });
  }
}
