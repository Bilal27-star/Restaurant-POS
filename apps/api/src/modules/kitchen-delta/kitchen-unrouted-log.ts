import type { UnroutedLine } from "./kitchen-delta.types.js";

/** Log when CREATE skips lines that cannot be routed to a kitchen station. */
export function logSkippedUnroutedKitchenLines(input: {
  restaurantId: string;
  orderId: string;
  lines: UnroutedLine[];
}): void {
  for (const line of input.lines) {
    console.info("[KITCHEN_UNROUTED_SKIPPED]", {
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      itemName: line.nameSnapshot,
      categoryName: line.categoryName,
      orderItemId: line.orderItemId,
    });
  }
}
