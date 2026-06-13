import type { KitchenStation, OrderItemKitchenStatus, Prisma } from "@pos/database";
import { Prisma as PrismaNamespace } from "@pos/database";

import { prisma } from "../../prisma/index.js";
import type {
  KitchenDetectLine,
  KitchenItemKitchenState,
  KitchenItemKitchenStatePatch,
  KitchenLastSentSnapshotV1,
} from "./kitchen-delta.types.js";
import { parseKitchenLastSentSnapshot } from "./kitchen-snapshot.js";

export type KitchenDeltaTx = Prisma.TransactionClient;

export const kitchenLineSelect = {
  id: true,
  menuItemId: true,
  nameSnapshot: true,
  quantity: true,
  kitchenNotes: true,
  removedIngredients: true,
  kitchenStatus: true,
  kitchenStation: true,
  kitchenSentAt: true,
  kitchenRevision: true,
  kitchenLastSentSnapshot: true,
  kitchenSnapshotHash: true,
  modifiers: { select: { modifierId: true, label: true } },
  menuItem: {
    select: {
      kitchenStation: true,
      category: { select: { name: true, kitchenStation: true } },
    },
  },
} satisfies Prisma.OrderItemSelect;

export type KitchenOrderItemRow = Prisma.OrderItemGetPayload<{ select: typeof kitchenLineSelect }>;

export function mapOrderItemToKitchenDetectLine(row: KitchenOrderItemRow): KitchenDetectLine {
  return {
    id: row.id,
    menuItemId: row.menuItemId,
    nameSnapshot: row.nameSnapshot,
    quantity: row.quantity,
    kitchenNotes: row.kitchenNotes,
    removedIngredients: row.removedIngredients,
    kitchenStatus: row.kitchenStatus,
    kitchenStation: row.kitchenStation,
    kitchenLastSentSnapshot: row.kitchenLastSentSnapshot,
    kitchenSnapshotHash: row.kitchenSnapshotHash,
    modifiers: row.modifiers.map((m) => ({ modifierId: m.modifierId, label: m.label })),
    menuItemKitchenStation: row.menuItem?.kitchenStation ?? null,
    menuCategoryKitchenStation: row.menuItem?.category?.kitchenStation ?? null,
    menuCategoryName: row.menuItem?.category?.name ?? null,
  };
}

export function mapKitchenOrderItemRowToState(row: KitchenOrderItemRow): KitchenItemKitchenState {
  return {
    orderItemId: row.id,
    kitchenStatus: row.kitchenStatus,
    kitchenStation: row.kitchenStation,
    kitchenSentAt: row.kitchenSentAt,
    kitchenRevision: row.kitchenRevision,
    kitchenLastSentSnapshot: parseKitchenLastSentSnapshot(row.kitchenLastSentSnapshot),
    kitchenSnapshotHash: row.kitchenSnapshotHash,
  };
}

export class KitchenDeltaRepository {
  async getOrderKitchenDispatchGeneration(restaurantId: string, orderId: string): Promise<number> {
    const row = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      select: { kitchenDispatchGeneration: true },
    });
    return row?.kitchenDispatchGeneration ?? 0;
  }

  async getLineKitchenState(
    tx: KitchenDeltaTx | typeof prisma,
    restaurantId: string,
    orderId: string,
    orderItemId: string,
  ): Promise<KitchenItemKitchenState | null> {
    const row = await tx.orderItem.findFirst({
      where: {
        id: orderItemId,
        orderId,
        order: { restaurantId },
      },
      select: kitchenLineSelect,
    });
    if (!row) return null;
    return mapKitchenOrderItemRowToState(row);
  }

  async listOrderLineKitchenStates(
    tx: KitchenDeltaTx | typeof prisma,
    restaurantId: string,
    orderId: string,
  ): Promise<KitchenItemKitchenState[]> {
    const rows = await tx.orderItem.findMany({
      where: { orderId, order: { restaurantId } },
      select: kitchenLineSelect,
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(mapKitchenOrderItemRowToState);
  }

  async loadKitchenDetectLines(
    tx: KitchenDeltaTx | typeof prisma,
    restaurantId: string,
    orderId: string,
  ): Promise<KitchenDetectLine[]> {
    const rows = await tx.orderItem.findMany({
      where: { orderId, order: { restaurantId } },
      select: kitchenLineSelect,
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(mapOrderItemToKitchenDetectLine);
  }

  async loadKitchenDetectLine(
    tx: KitchenDeltaTx | typeof prisma,
    restaurantId: string,
    orderId: string,
    orderItemId: string,
  ): Promise<KitchenDetectLine | null> {
    const row = await tx.orderItem.findFirst({
      where: { id: orderItemId, orderId, order: { restaurantId } },
      select: kitchenLineSelect,
    });
    return row ? mapOrderItemToKitchenDetectLine(row) : null;
  }

  async updateLineKitchenState(
    tx: KitchenDeltaTx,
    orderItemId: string,
    patch: KitchenItemKitchenStatePatch,
  ): Promise<void> {
    const data: Prisma.OrderItemUpdateInput = {};
    if (patch.kitchenStatus !== undefined) data.kitchenStatus = patch.kitchenStatus;
    if (patch.kitchenStation !== undefined) data.kitchenStation = patch.kitchenStation;
    if (patch.kitchenSentAt !== undefined) data.kitchenSentAt = patch.kitchenSentAt;
    if (patch.kitchenRevision !== undefined) data.kitchenRevision = patch.kitchenRevision;
    if (patch.kitchenLastSentSnapshot !== undefined) {
      data.kitchenLastSentSnapshot =
        patch.kitchenLastSentSnapshot === null
          ? PrismaNamespace.JsonNull
          : (patch.kitchenLastSentSnapshot as unknown as Prisma.InputJsonValue);
    }
    if (patch.kitchenSnapshotHash !== undefined) data.kitchenSnapshotHash = patch.kitchenSnapshotHash;
    await tx.orderItem.update({ where: { id: orderItemId }, data });
  }

  async incrementLineKitchenRevision(tx: KitchenDeltaTx, orderItemId: string): Promise<void> {
    await tx.orderItem.update({
      where: { id: orderItemId },
      data: { kitchenRevision: { increment: 1 } },
    });
  }

  async loadPendingRemovedDetectLines(
    tx: KitchenDeltaTx | typeof prisma,
    restaurantId: string,
    orderId: string,
  ): Promise<KitchenDetectLine[]> {
    const audits = await tx.orderItemKitchenAudit.findMany({
      where: { restaurantId, orderId, event: "REMOVED", intentId: null },
      orderBy: { createdAt: "asc" },
    });
    const lines: KitchenDetectLine[] = [];
    for (const audit of audits) {
      const raw = audit.snapshotJson;
      if (!raw || typeof raw !== "object") continue;
      const detectLine = (raw as { detectLine?: KitchenDetectLine }).detectLine;
      if (detectLine?.id) {
        lines.push(detectLine);
      }
    }
    return lines;
  }

  async linkRemovedAuditsToIntent(
    tx: KitchenDeltaTx,
    restaurantId: string,
    orderId: string,
    orderItemIds: string[],
    intentId: string,
  ): Promise<void> {
    if (orderItemIds.length === 0) return;
    await tx.orderItemKitchenAudit.updateMany({
      where: {
        restaurantId,
        orderId,
        event: "REMOVED",
        intentId: null,
        orderItemId: { in: orderItemIds },
      },
      data: { intentId },
    });
  }

  async markLineModifiedIfSent(tx: KitchenDeltaTx, orderItemId: string): Promise<void> {
    await tx.orderItem.updateMany({
      where: { id: orderItemId, kitchenStatus: { in: ["SENT", "MODIFIED"] } },
      data: { kitchenStatus: "MODIFIED", kitchenRevision: { increment: 1 } },
    });
  }

  async listLinesByKitchenStatus(
    restaurantId: string,
    orderId: string,
    statuses: OrderItemKitchenStatus[],
  ): Promise<KitchenItemKitchenState[]> {
    const rows = await prisma.orderItem.findMany({
      where: {
        orderId,
        kitchenStatus: { in: statuses },
        order: { restaurantId },
      },
      select: kitchenLineSelect,
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(mapKitchenOrderItemRowToState);
  }
}

/** Persist snapshot fields when a line transitions to SENT (Phase 2+ dispatch). */
export async function persistSentKitchenSnapshot(
  tx: KitchenDeltaTx,
  orderItemId: string,
  snapshot: KitchenLastSentSnapshotV1,
  snapshotHash: string,
  kitchenStation: KitchenStation,
  sentAt: Date,
): Promise<void> {
  await tx.orderItem.update({
    where: { id: orderItemId },
    data: {
      kitchenStatus: "SENT",
      kitchenStation,
      kitchenSentAt: sentAt,
      kitchenLastSentSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      kitchenSnapshotHash: snapshotHash,
    },
  });
}
