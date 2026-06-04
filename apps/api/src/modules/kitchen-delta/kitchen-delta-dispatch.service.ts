import type { KitchenPrintIntentStatus, KitchenStation } from "@pos/database";

import { prisma } from "../../prisma/index.js";
import type { PrintingService } from "../printing/printing.service.js";
import {
  detectKitchenDispatchIntent,
  KitchenUnroutedLinesError,
} from "./kitchen-delta-detector.js";
import { KitchenDeltaRepository, type KitchenDeltaTx } from "./kitchen-delta.repository.js";
import {
  applySentUpdatesForStationBundle,
  markBundleLinesPrintFailed,
} from "./kitchen-delta-line-updates.js";
import { appendKitchenDispatchAuditLogs } from "./kitchen-dispatch-audit.js";
import type { KitchenFullReprintPipelineInput } from "./kitchen-delta-full-reprint.context.js";
import { buildFullReprintDetectContext } from "./kitchen-delta-full-reprint.context.js";
import {
  buildKitchenDeltaTicketPayload,
  extractKitchenDeltaItemNames,
  summarizeKitchenDeltaStation,
} from "./kitchen-delta-ticket.builder.js";
import { collectPersistedLineIdsFromBundle } from "./kitchen-delta-line-updates.js";
import type { KitchenDispatchIntent, KitchenStationBundle } from "./kitchen-delta.types.js";
import {
  KitchenPrintIntentRepository,
  type KitchenPrintIntentWithStations,
} from "./kitchen-print-intent.repository.js";
import {
  buildKitchenDetectContext,
  loadKitchenDetectLines,
  type KitchenShadowPipelineInput,
} from "./kitchen-delta-shadow.context.js";

export type KitchenEnqueuedStationReport = {
  station: KitchenStation;
  printJobId: string;
  printerId: string | null;
  ticketMode: KitchenDispatchIntent["ticketMode"];
  itemNames: string[];
  sectionSummary: string;
};

export type KitchenDispatchResult = {
  intentId: string | null;
  intentStatus: KitchenPrintIntentStatus | null;
  kitchenDispatched: boolean;
  shadowLogged: boolean;
  enqueuedStations: KitchenEnqueuedStationReport[];
  failedStations: KitchenStation[];
};

export type KitchenShadowDispatchResult = Pick<
  KitchenDispatchResult,
  "intentId" | "intentStatus" | "kitchenDispatched" | "shadowLogged"
>;

function parseFrozenIntent(payloadJson: unknown): KitchenDispatchIntent {
  return payloadJson as KitchenDispatchIntent;
}

function parseStationBundle(payloadJson: unknown): KitchenStationBundle {
  return payloadJson as KitchenStationBundle;
}

function enqueueErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message.slice(0, 2000);
  }
  return String(err).slice(0, 2000);
}

function emptyDispatchResult(overrides: Partial<KitchenDispatchResult> = {}): KitchenDispatchResult {
  return {
    intentId: null,
    intentStatus: null,
    kitchenDispatched: false,
    shadowLogged: false,
    enqueuedStations: [],
    failedStations: [],
    ...overrides,
  };
}

function resultFromIntent(
  intent: KitchenPrintIntentWithStations | null,
  extras: Partial<KitchenDispatchResult> = {},
): KitchenDispatchResult {
  if (!intent) {
    return emptyDispatchResult(extras);
  }
  return emptyDispatchResult({
    intentId: intent.id,
    intentStatus: intent.status,
    kitchenDispatched: intent.status === "ENQUEUED" || intent.status === "COMPLETED",
    ...extras,
  });
}

/**
 * Phase 2 — real kitchen delta dispatch via PrintJob enqueue + SENT line writes.
 * Phase 1.5 shadow path retained when feature flag is off.
 */
export class KitchenDeltaDispatchService {
  private readonly kitchenRepo = new KitchenDeltaRepository();
  private readonly intentRepo = new KitchenPrintIntentRepository();

  constructor(private readonly printing: PrintingService | null = null) {}

  async beginIntent(
    tx: KitchenDeltaTx,
    input: Parameters<KitchenPrintIntentRepository["beginIntent"]>[1],
  ): Promise<string> {
    return this.intentRepo.beginIntent(tx, input);
  }

  /** Real dispatch — enqueue PrintJobs and persist SENT kitchen state. */
  async dispatch(intentId: string, restaurantId: string): Promise<KitchenDispatchResult> {
    return this.resume(intentId, restaurantId);
  }

  async resume(intentId: string, restaurantId: string): Promise<KitchenDispatchResult> {
    const locked = await prisma.$transaction(async (tx) => this.intentRepo.getIntentForUpdate(tx, intentId));
    if (!locked) {
      return emptyDispatchResult();
    }

    if (this.intentRepo.isTerminalIntentStatus(locked.status)) {
      return resultFromIntent(locked);
    }

    if (!this.intentRepo.needsResume(locked.status)) {
      return resultFromIntent(locked, { kitchenDispatched: false });
    }

    if (!this.printing) {
      console.warn("[KITCHEN_DELTA] printing service unavailable — dispatch skipped", { intentId });
      return resultFromIntent(locked, { kitchenDispatched: false });
    }

    const frozenIntent = parseFrozenIntent(locked.payloadJson);
    const restaurantName = await this.findRestaurantName(restaurantId);
    const actorUserId = await this.findOrderActorUserId(locked.orderId);

    const enqueuedStations: KitchenEnqueuedStationReport[] = [];
    const failedStations: KitchenStation[] = [];

    for (const stationRow of locked.stations) {
      if (this.intentRepo.shouldSkipStationDispatch(stationRow.status)) {
        continue;
      }

      if (stationRow.status === "FAILED") {
        console.info("[KITCHEN_DELTA_RETRY]", {
          intentId,
          orderId: locked.orderId,
          station: stationRow.station,
          previousError: stationRow.lastError,
        });
      }

      const bundle = parseStationBundle(stationRow.payloadJson);
      const payload = buildKitchenDeltaTicketPayload(frozenIntent, bundle, restaurantName);
      const itemNames = extractKitchenDeltaItemNames(bundle);

      try {
        const job = await this.printing.enqueueKitchenStationJob({
          restaurantId,
          requestedByUserId: actorUserId,
          station: stationRow.station,
          payload,
          itemNames,
          orderId: locked.orderId,
        });

        const jobId = (job as { id: string; printerId?: string | null }).id;
        const printerId = (job as { printerId?: string | null }).printerId ?? null;

        await prisma.$transaction(async (tx) => {
          const current = await this.intentRepo.getIntentForUpdate(tx, intentId);
          if (!current) return;

          const currentStation = current.stations.find((s) => s.id === stationRow.id);
          if (!currentStation || this.intentRepo.shouldSkipStationDispatch(currentStation.status)) {
            return;
          }

          await this.intentRepo.markStationEnqueued(tx, currentStation.id, jobId);
          await this.applyLineUpdatesForStation(tx, {
            restaurantId,
            orderId: locked.orderId,
            intentId,
            bundle,
            station: stationRow.station,
            ticketMode: frozenIntent.ticketMode,
          });
          await appendKitchenDispatchAuditLogs(
            tx,
            collectPersistedLineIdsFromBundle(bundle).map((orderItemId) => ({
              restaurantId,
              orderId: locked.orderId,
              orderItemId,
              mutationKind: frozenIntent.mutationKind,
              intentId,
              printJobId: jobId,
              status: "ENQUEUED",
            })),
          );
          await this.intentRepo.syncParentIntentStatus(tx, intentId, locked.orderId);
        });

        console.info("[KITCHEN_DELTA_DISPATCH]", {
          intentId,
          orderId: locked.orderId,
          station: stationRow.station,
          ticketMode: frozenIntent.ticketMode,
          printJobId: jobId,
          printerId,
          itemNames,
          sectionSummary: summarizeKitchenDeltaStation(bundle),
        });

        enqueuedStations.push({
          station: stationRow.station,
          printJobId: jobId,
          printerId,
          ticketMode: frozenIntent.ticketMode,
          itemNames,
          sectionSummary: summarizeKitchenDeltaStation(bundle),
        });
      } catch (err) {
        console.error("[KITCHEN_DELTA_DISPATCH_FAILED]", {
          intentId,
          orderId: locked.orderId,
          station: stationRow.station,
          err,
        });

        await prisma.$transaction(async (tx) => {
          const current = await this.intentRepo.getIntentForUpdate(tx, intentId);
          if (!current) return;

          const currentStation = current.stations.find((s) => s.id === stationRow.id);
          if (!currentStation || this.intentRepo.shouldSkipStationDispatch(currentStation.status)) {
            return;
          }

          await this.intentRepo.markStationFailed(tx, currentStation.id, enqueueErrorMessage(err));
          await markBundleLinesPrintFailed(tx, bundle);
          await this.intentRepo.syncParentIntentStatus(tx, intentId, locked.orderId);
        });

        failedStations.push(stationRow.station);
      }
    }

    const finalIntent = await this.intentRepo.findByClientMutationId(restaurantId, locked.clientMutationId);
    return resultFromIntent(finalIntent, {
      kitchenDispatched: this.intentRepo.isKitchenDispatched(finalIntent?.status ?? null),
      enqueuedStations,
      failedStations,
    });
  }

  /** Phase 1.5 shadow resume — logs frozen payload, marks intent COMPLETED (flag-off path). */
  async resumeShadow(intentId: string): Promise<KitchenShadowDispatchResult> {
    return prisma.$transaction(async (tx) => {
      const intent = await this.intentRepo.getIntentForUpdate(tx, intentId);
      if (!intent) {
        return { intentId: null, intentStatus: null, kitchenDispatched: false, shadowLogged: false };
      }

      if (this.intentRepo.isTerminalIntentStatus(intent.status)) {
        return {
          intentId: intent.id,
          intentStatus: intent.status,
          kitchenDispatched: true,
          shadowLogged: false,
        };
      }

      if (!this.intentRepo.needsResume(intent.status)) {
        return {
          intentId: intent.id,
          intentStatus: intent.status,
          kitchenDispatched: false,
          shadowLogged: false,
        };
      }

      this.logShadowIntent(intent);
      await this.intentRepo.markIntentCompleted(tx, intent.id, intent.orderId);

      return {
        intentId: intent.id,
        intentStatus: "COMPLETED",
        kitchenDispatched: true,
        shadowLogged: true,
      };
    });
  }

  async dispatchShadow(intentId: string): Promise<KitchenShadowDispatchResult> {
    return this.resumeShadow(intentId);
  }

  /** Phase 2.5 — FULL_REPRINT recovery pipeline (replay-safe via clientMutationId). */
  async runFullReprintPipeline(input: KitchenFullReprintPipelineInput): Promise<KitchenDispatchResult> {
    const clientMutationId = input.clientMutationId.trim();
    if (!clientMutationId) {
      return emptyDispatchResult();
    }

    const existing = await this.intentRepo.findByClientMutationId(input.restaurantId, clientMutationId);
    if (existing) {
      if (this.intentRepo.isTerminalIntentStatus(existing.status)) {
        return resultFromIntent(existing);
      }
      return this.dispatch(existing.id, input.restaurantId);
    }

    let detected: KitchenDispatchIntent | null;
    try {
      const lines = await loadKitchenDetectLines(this.kitchenRepo, input.restaurantId, input.order.id);
      const ctx = buildFullReprintDetectContext(input, lines);
      detected = detectKitchenDispatchIntent(ctx);
    } catch (err) {
      if (err instanceof KitchenUnroutedLinesError) {
        throw err;
      }
      throw err;
    }

    if (!detected) {
      return emptyDispatchResult();
    }

    const intentId = await prisma.$transaction(async (tx) =>
      this.beginIntent(tx, {
        restaurantId: input.restaurantId,
        orderId: input.order.id,
        clientMutationId,
        intent: detected!,
      }),
    );

    console.info("[KITCHEN_DELTA_FULL_REPRINT]", {
      intentId,
      orderId: input.order.id,
      clientMutationId,
      lineCount: detected.stationBundles.reduce(
        (n, b) => n + b.sections.reduce((m, s) => m + s.lines.length, 0),
        0,
      ),
    });

    return this.dispatch(intentId, input.restaurantId);
  }

  /** Real delta pipeline when feature flag is on. */
  async runPipeline(input: KitchenShadowPipelineInput): Promise<KitchenDispatchResult> {
    return this.runMutationPipeline(input, (intentId) => this.dispatch(intentId, input.restaurantId));
  }

  /** Shadow pipeline when feature flag is off. */
  async runShadowPipeline(input: KitchenShadowPipelineInput): Promise<KitchenShadowDispatchResult> {
    const result = await this.runMutationPipeline(input, async (intentId) => {
      const shadow = await this.dispatchShadow(intentId);
      return {
        ...shadow,
        enqueuedStations: [],
        failedStations: [],
      };
    });
    return {
      intentId: result.intentId,
      intentStatus: result.intentStatus,
      kitchenDispatched: result.kitchenDispatched,
      shadowLogged: result.shadowLogged,
    };
  }

  private async runMutationPipeline(
    input: KitchenShadowPipelineInput,
    dispatchFn: (intentId: string) => Promise<KitchenDispatchResult>,
  ): Promise<KitchenDispatchResult> {
    const clientMutationId = input.clientMutationId.trim();
    if (!clientMutationId) {
      return emptyDispatchResult();
    }

    const existing = await this.intentRepo.findByClientMutationId(input.restaurantId, clientMutationId);

    if (!input.mutationApplied) {
      return this.handleReplayRecovery(input, existing, clientMutationId, dispatchFn);
    }

    return this.handleFirstExecution(input, clientMutationId, existing, dispatchFn);
  }

  private async handleReplayRecovery(
    input: KitchenShadowPipelineInput,
    existing: KitchenPrintIntentWithStations | null,
    clientMutationId: string,
    dispatchFn: (intentId: string) => Promise<KitchenDispatchResult>,
  ): Promise<KitchenDispatchResult> {
    if (existing) {
      if (this.intentRepo.isTerminalIntentStatus(existing.status)) {
        return resultFromIntent(existing);
      }
      if (this.intentRepo.needsResume(existing.status)) {
        return dispatchFn(existing.id);
      }
      return resultFromIntent(existing, { kitchenDispatched: false });
    }

    const detected = await this.detectForPipeline(input);
    if (!detected) {
      return emptyDispatchResult();
    }

    const intentId = await prisma.$transaction(async (tx) => {
      const lineMutationIdempotencyId = await this.intentRepo.findLineMutationIdempotencyId(
        input.restaurantId,
        clientMutationId,
      );
      return this.beginIntent(tx, {
        restaurantId: input.restaurantId,
        orderId: input.order.id,
        clientMutationId,
        intent: detected,
        lineMutationIdempotencyId,
      });
    });

    return dispatchFn(intentId);
  }

  private async handleFirstExecution(
    input: KitchenShadowPipelineInput,
    clientMutationId: string,
    existing: KitchenPrintIntentWithStations | null,
    dispatchFn: (intentId: string) => Promise<KitchenDispatchResult>,
  ): Promise<KitchenDispatchResult> {
    if (existing) {
      if (this.intentRepo.isTerminalIntentStatus(existing.status)) {
        return resultFromIntent(existing);
      }
      return dispatchFn(existing.id);
    }

    let detected: KitchenDispatchIntent | null;
    try {
      detected = await this.detectForPipeline(input);
    } catch (err) {
      if (err instanceof KitchenUnroutedLinesError) {
        throw err;
      }
      throw err;
    }

    if (!detected) {
      return emptyDispatchResult();
    }

    const intentId = await prisma.$transaction(async (tx) => {
      const lineMutationIdempotencyId = await this.intentRepo.findLineMutationIdempotencyId(
        input.restaurantId,
        clientMutationId,
      );
      return this.beginIntent(tx, {
        restaurantId: input.restaurantId,
        orderId: input.order.id,
        clientMutationId,
        intent: detected,
        lineMutationIdempotencyId,
      });
    });

    return dispatchFn(intentId);
  }

  private async applyLineUpdatesForStation(
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
    await applySentUpdatesForStationBundle(
      { kitchenRepo: this.kitchenRepo, intentRepo: this.intentRepo },
      tx,
      input,
    );
  }

  private async detectForPipeline(input: KitchenShadowPipelineInput): Promise<KitchenDispatchIntent | null> {
    if (input.kind === "LINE_DELETE" && !input.deletedLine) {
      return null;
    }
    const lines = await loadKitchenDetectLines(this.kitchenRepo, input.restaurantId, input.order.id);
    const ctx = buildKitchenDetectContext(input, lines);
    return detectKitchenDispatchIntent(ctx);
  }

  private async findRestaurantName(restaurantId: string): Promise<string> {
    const row = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    });
    return row?.name?.trim() || "Restaurant";
  }

  private async findOrderActorUserId(orderId: string): Promise<string | null> {
    const row = await prisma.order.findUnique({
      where: { id: orderId },
      select: { createdByUserId: true, waiterId: true },
    });
    return row?.createdByUserId ?? row?.waiterId ?? null;
  }

  private logShadowIntent(intent: KitchenPrintIntentWithStations): void {
    console.info("[KITCHEN_DELTA_SHADOW]", {
      intentId: intent.id,
      orderId: intent.orderId,
      clientMutationId: intent.clientMutationId,
      mutationKind: intent.mutationKind,
      ticketMode: intent.ticketMode,
      status: intent.status,
      stationCount: intent.stations.length,
      payload: intent.payloadJson,
    });
  }
}
