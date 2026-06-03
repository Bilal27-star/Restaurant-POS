import type { KitchenPrintIntentStatus, KitchenStation } from "@pos/database";

import { prisma } from "../../prisma/index.js";

export type KitchenConsistencyIssue = {
  code: string;
  message: string;
  orderItemId?: string;
  intentId?: string;
  station?: KitchenStation;
  printJobId?: string;
};

export type KitchenRecoveryInfo = {
  printFailedLineIds: string[];
  retriableIntentIds: string[];
  partialIntentIds: string[];
  consistencyIssues: KitchenConsistencyIssue[];
  suggestedActions: string[];
};

const RETRIABLE_INTENT_STATUSES: KitchenPrintIntentStatus[] = ["PARTIAL", "FAILED", "PENDING"];

export async function buildKitchenRecoveryInfo(
  restaurantId: string,
  orderId: string,
): Promise<KitchenRecoveryInfo> {
  const [lines, intents, stationsWithJobs] = await Promise.all([
    prisma.orderItem.findMany({
      where: { orderId, order: { restaurantId } },
      select: {
        id: true,
        nameSnapshot: true,
        kitchenStatus: true,
        kitchenSnapshotHash: true,
        kitchenLastSentSnapshot: true,
      },
    }),
    prisma.kitchenPrintIntent.findMany({
      where: { restaurantId, orderId },
      select: { id: true, status: true, clientMutationId: true, mutationKind: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.kitchenPrintIntentStation.findMany({
      where: { intent: { restaurantId, orderId } },
      select: {
        id: true,
        intentId: true,
        station: true,
        status: true,
        printJobId: true,
        lastError: true,
        printJob: { select: { id: true, status: true, lastError: true, attempts: true, maxAttempts: true } },
      },
    }),
  ]);

  const issues: KitchenConsistencyIssue[] = [];
  const printFailedLineIds = lines.filter((l) => l.kitchenStatus === "PRINT_FAILED").map((l) => l.id);

  for (const line of lines) {
    if (line.kitchenStatus === "SENT" && (!line.kitchenSnapshotHash || !line.kitchenLastSentSnapshot)) {
      issues.push({
        code: "SENT_WITHOUT_SNAPSHOT",
        message: `Line "${line.nameSnapshot}" is SENT but missing kitchen snapshot/hash`,
        orderItemId: line.id,
      });
    }
  }

  for (const station of stationsWithJobs) {
    if (station.status === "ENQUEUED" && !station.printJobId) {
      issues.push({
        code: "ENQUEUED_WITHOUT_PRINT_JOB",
        message: `Station ${station.station} is ENQUEUED without a linked PrintJob`,
        intentId: station.intentId,
        station: station.station,
      });
    }

    if (station.printJob && station.status === "ENQUEUED" && station.printJob.status === "FAILED") {
      issues.push({
        code: "STATION_ENQUEUED_JOB_FAILED",
        message: `Station ${station.station} is ENQUEUED but PrintJob is FAILED — run recovery resume or full-reprint`,
        intentId: station.intentId,
        station: station.station,
        printJobId: station.printJob.id,
      });
    }

    if (station.status === "FAILED" && station.lastError) {
      issues.push({
        code: "STATION_DISPATCH_FAILED",
        message: `Station ${station.station} dispatch failed: ${station.lastError}`,
        intentId: station.intentId,
        station: station.station,
        printJobId: station.printJobId ?? undefined,
      });
    }
  }

  const retriableIntentIds = intents
    .filter((i) => RETRIABLE_INTENT_STATUSES.includes(i.status))
    .map((i) => i.id);
  const partialIntentIds = intents.filter((i) => i.status === "PARTIAL").map((i) => i.id);

  const suggestedActions: string[] = [];
  if (printFailedLineIds.length > 0) {
    suggestedActions.push(
      "POST /orders/:orderId/kitchen/full-reprint with a new clientMutationId to recover PRINT_FAILED lines",
    );
  }
  if (retriableIntentIds.length > 0) {
    suggestedActions.push(
      "Replay the original mutation clientMutationId to resume PARTIAL/FAILED kitchen intents without duplicate tickets",
    );
  }
  if (issues.some((i) => i.code === "STATION_ENQUEUED_JOB_FAILED")) {
    suggestedActions.push("Verify printer connectivity; terminal PrintJob failures auto-mark lines PRINT_FAILED");
  }
  if (suggestedActions.length === 0 && intents.length === 0) {
    suggestedActions.push("No kitchen recovery actions required");
  }

  if (issues.length > 0 || printFailedLineIds.length > 0 || retriableIntentIds.length > 0) {
    console.info("[KITCHEN_DELTA_DIAGNOSTICS]", {
      orderId,
      restaurantId,
      printFailedLineCount: printFailedLineIds.length,
      retriableIntentCount: retriableIntentIds.length,
      issueCount: issues.length,
      issues: issues.map((i) => i.code),
    });
  }

  return {
    printFailedLineIds,
    retriableIntentIds,
    partialIntentIds,
    consistencyIssues: issues,
    suggestedActions,
  };
}
