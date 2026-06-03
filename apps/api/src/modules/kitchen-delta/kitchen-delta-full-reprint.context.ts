import type { OrderWithRelations } from "../orders/orders.repository.js";
import { resolveOrderWaiterName } from "../orders/order-waiter-name.js";
import type { KitchenDetectFullReprintContext, KitchenDetectLine } from "./kitchen-delta.types.js";

export type KitchenFullReprintPipelineInput = {
  restaurantId: string;
  order: OrderWithRelations;
  clientMutationId: string;
  lineIds?: string[];
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

export function buildFullReprintDetectContext(
  input: KitchenFullReprintPipelineInput,
  lines: KitchenDetectLine[],
): KitchenDetectFullReprintContext {
  return {
    ...baseOrderContext(input.order),
    mutationKind: "FULL_REPRINT",
    clientMutationId: input.clientMutationId,
    lines,
    lineIds: input.lineIds,
  };
}
