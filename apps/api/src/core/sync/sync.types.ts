/**
 * Types reserved for a future offline → cloud sync pipeline (outbox, cursors, conflict metadata).
 * No runtime behavior here yet; keeps domain language consistent across services.
 *
 * Align operation kinds with `@pos/offline-engine` `OutboxOperationKind` when adding `/sync/push`.
 */
export type SyncEntityKind =
  | "order"
  | "payment"
  | "menu"
  | "table"
  | "shift"
  | "expense"
  | "setting";

export type OutboxStatus = "pending" | "in_flight" | "completed" | "dead";

export type OutboxEntry = {
  id: string;
  tenantId: string;
  deviceId: string;
  kind: SyncEntityKind;
  payloadVersion: number;
  createdAt: Date;
  status: OutboxStatus;
};

export type SyncCursor = {
  tenantId: string;
  deviceId: string;
  lastPulledAt: Date;
  serverCursor: string;
};
