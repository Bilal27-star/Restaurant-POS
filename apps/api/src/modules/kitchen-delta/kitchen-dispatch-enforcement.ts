import { resolveLineKitchenStation } from "./kitchen-delta-routing.js";
import type { KitchenDeltaRepository } from "./kitchen-delta.repository.js";
import { loadKitchenDetectLines } from "./kitchen-delta-shadow.context.js";
import type { KitchenDispatchResult } from "./kitchen-delta-dispatch.service.js";

/** True when the order has at least one line routable to a kitchen station. */
export async function orderHasKitchenRoutableLines(
  kitchenRepo: KitchenDeltaRepository,
  restaurantId: string,
  orderId: string,
): Promise<boolean> {
  const lines = await loadKitchenDetectLines(kitchenRepo, restaurantId, orderId);
  return lines.some((line) => resolveLineKitchenStation(line) != null);
}

/**
 * When kitchen delta printing is on and this mutation created a kitchen intent,
 * require a successful enqueue. Unrouted-only mutations produce no intent and must not fail.
 */
export async function kitchenDispatchRequiredButMissing(
  _kitchenRepo: KitchenDeltaRepository,
  _restaurantId: string,
  _orderId: string,
  mutationApplied: boolean,
  mutationKey: string | null | undefined,
  result: KitchenDispatchResult | null,
): Promise<boolean> {
  if (!mutationApplied || !mutationKey?.trim()) {
    return false;
  }
  if (result?.kitchenDispatched) {
    return false;
  }
  return Boolean(result?.intentId);
}
