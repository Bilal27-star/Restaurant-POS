import type { KitchenMutationKind } from "@pos/database";

import type { KitchenDeltaTx } from "./kitchen-delta.repository.js";

export type KitchenDispatchAuditInput = {
  restaurantId: string;
  orderId: string;
  orderItemId: string | null;
  mutationKind: KitchenMutationKind;
  intentId: string;
  printJobId: string | null;
  status: string;
};

export async function appendKitchenDispatchAuditLogs(
  tx: KitchenDeltaTx,
  entries: KitchenDispatchAuditInput[],
): Promise<void> {
  if (entries.length === 0) return;
  await tx.kitchenDispatchAuditLog.createMany({
    data: entries.map((e) => ({
      restaurantId: e.restaurantId,
      orderId: e.orderId,
      orderItemId: e.orderItemId,
      mutationKind: e.mutationKind,
      intentId: e.intentId,
      printJobId: e.printJobId,
      status: e.status,
    })),
  });
}

/** Staff-initiated full kitchen reprint from table modal (recovery). */
export async function appendManualKitchenReprintAuditLog(input: {
  restaurantId: string;
  orderId: string;
  intentId: string;
  printJobId?: string | null;
}): Promise<void> {
  const { prisma } = await import("../../prisma/index.js");
  await prisma.kitchenDispatchAuditLog.create({
    data: {
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      orderItemId: null,
      mutationKind: "FULL_REPRINT",
      intentId: input.intentId,
      printJobId: input.printJobId ?? null,
      status: "KITCHEN_REPRINT_MANUAL",
    },
  });
}

export async function listKitchenDispatchAuditLogs(
  restaurantId: string,
  orderId: string,
): Promise<
  {
    id: string;
    orderId: string;
    orderItemId: string | null;
    mutationKind: KitchenMutationKind;
    intentId: string;
    printJobId: string | null;
    status: string;
    dispatchedAt: Date;
  }[]
> {
  const { prisma } = await import("../../prisma/index.js");
  return prisma.kitchenDispatchAuditLog.findMany({
    where: { restaurantId, orderId },
    orderBy: { dispatchedAt: "asc" },
    select: {
      id: true,
      orderId: true,
      orderItemId: true,
      mutationKind: true,
      intentId: true,
      printJobId: true,
      status: true,
      dispatchedAt: true,
    },
  });
}
