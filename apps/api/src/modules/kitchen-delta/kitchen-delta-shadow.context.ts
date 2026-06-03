import type { OrderWithRelations } from "../orders/orders.repository.js";
import { resolveOrderWaiterName } from "../orders/order-waiter-name.js";
import type {
  KitchenDetectContext,
  KitchenDetectLine,
  KitchenDetectLineAddContext,
  KitchenDetectLineDeleteContext,
  KitchenDetectLineUpdateContext,
  KitchenDetectCreateContext,
} from "./kitchen-delta.types.js";
import { KitchenDeltaRepository } from "./kitchen-delta.repository.js";
import { prisma } from "../../prisma/index.js";

export type KitchenShadowMutationKind =
  | "CREATE"
  | "LINE_ADD"
  | "LINE_UPDATE"
  | "LINE_DELETE"
  | "DISPATCH_PENDING";

export type KitchenShadowPipelineInput =
  | {
      kind: "CREATE";
      restaurantId: string;
      order: OrderWithRelations;
      clientMutationId: string;
      mutationApplied: boolean;
    }
  | {
      kind: "LINE_ADD";
      restaurantId: string;
      order: OrderWithRelations;
      clientMutationId: string;
      mutationApplied: boolean;
      addedLineIds: string[];
    }
  | {
      kind: "LINE_UPDATE";
      restaurantId: string;
      order: OrderWithRelations;
      clientMutationId: string;
      mutationApplied: boolean;
      lineId: string;
      beforeLine: KitchenDetectLine;
    }
  | {
      kind: "LINE_DELETE";
      restaurantId: string;
      order: OrderWithRelations;
      clientMutationId: string;
      mutationApplied: boolean;
      /** Required on first execution; omitted on replay after row delete. */
      deletedLine?: KitchenDetectLine;
    }
  | {
      kind: "DISPATCH_PENDING";
      restaurantId: string;
      order: OrderWithRelations;
      clientMutationId: string;
      mutationApplied: boolean;
      removedLines: KitchenDetectLine[];
    };

function baseOrderContext(order: OrderWithRelations) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    tableNumber: order.table?.number ?? null,
    orderType: order.type,
    waiterName: resolveOrderWaiterName(order),
    kitchenNotes: order.kitchenNotes,
  };
}

export function buildKitchenDetectContext(
  input: KitchenShadowPipelineInput,
  lines: KitchenDetectLine[],
): KitchenDetectContext {
  const base = baseOrderContext(input.order);
  switch (input.kind) {
    case "CREATE":
      return {
        ...base,
        mutationKind: "CREATE",
        clientMutationId: input.clientMutationId,
        lines,
      } satisfies KitchenDetectCreateContext;
    case "LINE_ADD":
      return {
        ...base,
        mutationKind: "LINE_ADD",
        clientMutationId: input.clientMutationId,
        lines,
        addedLineIds: input.addedLineIds,
      } satisfies KitchenDetectLineAddContext;
    case "LINE_UPDATE":
      return {
        ...base,
        mutationKind: "LINE_UPDATE",
        clientMutationId: input.clientMutationId,
        lines,
        lineId: input.lineId,
        beforeLine: input.beforeLine,
      } satisfies KitchenDetectLineUpdateContext;
    case "LINE_DELETE":
      if (!input.deletedLine) {
        throw new Error("deletedLine required for LINE_DELETE detect context");
      }
      return {
        ...base,
        mutationKind: "LINE_DELETE",
        clientMutationId: input.clientMutationId,
        lines,
        deletedLine: input.deletedLine,
      } satisfies KitchenDetectLineDeleteContext;
    case "DISPATCH_PENDING":
      return {
        ...base,
        mutationKind: "DISPATCH_PENDING",
        clientMutationId: input.clientMutationId,
        lines,
        removedLines: input.removedLines,
      };
  }
}

export async function loadKitchenDetectLines(
  kitchenRepo: KitchenDeltaRepository,
  restaurantId: string,
  orderId: string,
): Promise<KitchenDetectLine[]> {
  return kitchenRepo.loadKitchenDetectLines(prisma, restaurantId, orderId);
}
