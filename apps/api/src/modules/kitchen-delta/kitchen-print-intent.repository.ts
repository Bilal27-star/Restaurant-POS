import type {
  KitchenMutationKind,
  KitchenPrintIntentStationStatus,
  KitchenPrintIntentStatus,
  KitchenTicketMode,
  OrderItemKitchenAuditEvent,
  Prisma,
} from "@pos/database";

import { prisma } from "../../prisma/index.js";
import type { KitchenDispatchIntent } from "./kitchen-delta.types.js";
import type { KitchenDeltaTx } from "./kitchen-delta.repository.js";

export type KitchenPrintIntentWithStations = Prisma.KitchenPrintIntentGetPayload<{
  include: { stations: true };
}>;

export type BeginIntentInput = {
  restaurantId: string;
  orderId: string;
  clientMutationId: string;
  intent: KitchenDispatchIntent;
  lineMutationIdempotencyId?: string | null;
};

const intentWithStations = {
  include: { stations: { orderBy: { station: "asc" as const } } },
} satisfies Prisma.KitchenPrintIntentDefaultArgs;

function toPrismaMutationKind(kind: KitchenDispatchIntent["mutationKind"]): KitchenMutationKind {
  return kind as KitchenMutationKind;
}

function toPrismaTicketMode(mode: KitchenDispatchIntent["ticketMode"]): KitchenTicketMode {
  return mode as KitchenTicketMode;
}

export class KitchenPrintIntentRepository {
  async findByClientMutationId(
    restaurantId: string,
    clientMutationId: string,
  ): Promise<KitchenPrintIntentWithStations | null> {
    return prisma.kitchenPrintIntent.findUnique({
      where: {
        restaurantId_clientMutationId: { restaurantId, clientMutationId },
      },
      ...intentWithStations,
    });
  }

  async findLineMutationIdempotencyId(
    restaurantId: string,
    clientMutationId: string,
  ): Promise<string | null> {
    const row = await prisma.orderLineMutationIdempotency.findUnique({
      where: {
        restaurantId_clientMutationId: { restaurantId, clientMutationId },
      },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * Insert PENDING intent + station rows (Transaction A body).
   * Idempotent: returns existing intent id when `(restaurantId, clientMutationId)` already exists.
   */
  async beginIntent(tx: KitchenDeltaTx, input: BeginIntentInput): Promise<string> {
    const existing = await tx.kitchenPrintIntent.findUnique({
      where: {
        restaurantId_clientMutationId: {
          restaurantId: input.restaurantId,
          clientMutationId: input.clientMutationId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    const order = await tx.order.findFirst({
      where: { id: input.orderId, restaurantId: input.restaurantId },
      select: { kitchenDispatchGeneration: true },
    });
    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    const created = await tx.kitchenPrintIntent.create({
      data: {
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        clientMutationId: input.clientMutationId,
        lineMutationIdempotencyId: input.lineMutationIdempotencyId ?? null,
        mutationKind: toPrismaMutationKind(input.intent.mutationKind),
        ticketMode: toPrismaTicketMode(input.intent.ticketMode),
        status: "PENDING",
        payloadJson: input.intent as unknown as Prisma.InputJsonValue,
        dispatchGenerationAtCreate: order.kitchenDispatchGeneration,
        stations: {
          create: input.intent.stationBundles.map((bundle) => ({
            station: bundle.station,
            status: "PENDING",
            payloadJson: bundle as unknown as Prisma.InputJsonValue,
          })),
        },
      },
      select: { id: true },
    });
    return created.id;
  }

  async lockIntentForUpdate(tx: KitchenDeltaTx, intentId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM kitchen_print_intents WHERE id = ${intentId}::uuid FOR UPDATE`;
  }

  async getIntentForUpdate(
    tx: KitchenDeltaTx,
    intentId: string,
  ): Promise<KitchenPrintIntentWithStations | null> {
    await this.lockIntentForUpdate(tx, intentId);
    return tx.kitchenPrintIntent.findUnique({
      where: { id: intentId },
      ...intentWithStations,
    });
  }

  async markIntentCompleted(tx: KitchenDeltaTx, intentId: string, orderId: string): Promise<void> {
    const intent = await tx.kitchenPrintIntent.findUnique({
      where: { id: intentId },
      select: { status: true },
    });
    if (!intent) return;

    const wasPending = intent.status === "PENDING";

    await tx.kitchenPrintIntent.update({
      where: { id: intentId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    if (wasPending) {
      await tx.order.update({
        where: { id: orderId },
        data: { kitchenDispatchGeneration: { increment: 1 } },
      });
    }
  }

  async markStationEnqueued(
    tx: KitchenDeltaTx,
    stationRowId: string,
    printJobId: string,
  ): Promise<void> {
    await tx.kitchenPrintIntentStation.update({
      where: { id: stationRowId },
      data: {
        status: "ENQUEUED",
        printJobId,
        enqueuedAt: new Date(),
      },
    });
  }

  async markStationFailed(tx: KitchenDeltaTx, stationRowId: string, lastError?: string | null): Promise<void> {
    await tx.kitchenPrintIntentStation.update({
      where: { id: stationRowId },
      data: {
        status: "FAILED",
        lastError: lastError ?? null,
        failedAt: new Date(),
      },
    });
  }

  /** Spec §8 — derive parent intent status from station child rows. */
  computeParentIntentStatus(
    stations: { status: KitchenPrintIntentStationStatus }[],
  ): KitchenPrintIntentStatus {
    if (stations.length === 0) {
      return "PENDING";
    }

    const statuses = stations.map((s) => s.status);
    const anyPending = statuses.some((s) => s === "PENDING");
    const anyEnqueued = statuses.some((s) => s === "ENQUEUED" || s === "COMPLETED");
    const anyFailed = statuses.some((s) => s === "FAILED");
    const allSuccess = statuses.every((s) => s === "ENQUEUED" || s === "COMPLETED");
    const allFailed = statuses.every((s) => s === "FAILED");

    if (!anyEnqueued && !anyFailed) {
      return "PENDING";
    }
    if (allSuccess) {
      return "ENQUEUED";
    }
    if (allFailed) {
      return "FAILED";
    }
    if (anyEnqueued && anyFailed) {
      return "PARTIAL";
    }
    if (anyPending && (anyEnqueued || anyFailed)) {
      return anyFailed ? "PARTIAL" : "PENDING";
    }
    return "PENDING";
  }

  async syncParentIntentStatus(
    tx: KitchenDeltaTx,
    intentId: string,
    orderId: string,
  ): Promise<KitchenPrintIntentStatus> {
    const intent = await tx.kitchenPrintIntent.findUnique({
      where: { id: intentId },
      select: { status: true, stations: { select: { status: true } } },
    });
    if (!intent) {
      return "PENDING";
    }

    const nextStatus = this.computeParentIntentStatus(intent.stations);
    if (nextStatus === intent.status) {
      return nextStatus;
    }

    const wasPending = intent.status === "PENDING";
    const leavesPending =
      wasPending && (nextStatus === "ENQUEUED" || nextStatus === "PARTIAL" || nextStatus === "FAILED");

    await tx.kitchenPrintIntent.update({
      where: { id: intentId },
      data: { status: nextStatus },
    });

    if (leavesPending) {
      await tx.order.update({
        where: { id: orderId },
        data: { kitchenDispatchGeneration: { increment: 1 } },
      });
    }

    return nextStatus;
  }

  shouldSkipStationDispatch(status: KitchenPrintIntentStationStatus): boolean {
    return status === "ENQUEUED" || status === "COMPLETED";
  }

  async appendAuditEntry(
    tx: KitchenDeltaTx,
    input: {
      restaurantId: string;
      orderId: string;
      orderItemId: string;
      event: OrderItemKitchenAuditEvent;
      snapshotJson: Prisma.InputJsonValue;
      intentId?: string | null;
    },
  ): Promise<void> {
    await tx.orderItemKitchenAudit.create({
      data: {
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        orderItemId: input.orderItemId,
        event: input.event,
        snapshotJson: input.snapshotJson,
        intentId: input.intentId ?? null,
      },
    });
  }

  isTerminalIntentStatus(status: KitchenPrintIntentStatus): boolean {
    return status === "ENQUEUED" || status === "COMPLETED";
  }

  isKitchenDispatched(status: KitchenPrintIntentStatus | null): boolean {
    return status === "ENQUEUED" || status === "COMPLETED";
  }

  needsResume(status: KitchenPrintIntentStatus): boolean {
    return status === "PENDING" || status === "PARTIAL" || status === "FAILED";
  }
}
