import type { OfflineRuntime } from "@pos/offline-engine";
import { getOrCreateDeviceId } from "@pos/offline-engine";

import { loadPendingPosOrders, savePendingPosOrders } from "@/lib/pos-pending-orders-storage";

/**
 * Moves legacy localStorage dine-in pending orders into the IndexedDB outbox (v1 migration).
 */
export async function migrateLegacyPendingOrdersToOutbox(tenantId: string, sync: OfflineRuntime["sync"]): Promise<void> {
  if (typeof window === "undefined" || tenantId === "anon") return;
  const pending = loadPendingPosOrders(tenantId);
  if (pending.length === 0) return;

  const deviceId = getOrCreateDeviceId();
  for (const row of pending) {
    try {
      await sync.enqueue({
        id: `legacy-order:${row.clientMutationId}`,
        tenantId,
        deviceId,
        kind: "order.create",
        idempotencyKey: null,
        clientMutationId: row.clientMutationId,
        baseServerVersion: null,
        payload: { ...row.body, clientMutationId: row.clientMutationId },
      });
    } catch {
      /* skip row — e.g. RBAC */
    }
  }
  savePendingPosOrders(tenantId, []);
}
