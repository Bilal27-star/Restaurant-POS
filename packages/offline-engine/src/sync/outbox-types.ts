/** Domain-aligned mutation kinds for the sync pipeline (matches API surface areas). */
export type OutboxOperationKind =
  | "order.create"
  | "order.patch"
  | "order.line.add"
  | "order.line.update"
  | "order.line.delete"
  | "order.complete"
  | "order.cancel"
  | "payment.capture"
  | "payment.refund"
  | "shift.open"
  | "shift.close"
  | "expense.record"
  | "table.update"
  /** Local-only: never sent upstream; used for recovery audit. */
  | "print.job";

export type OutboxOperationStatus = "pending" | "in_flight" | "completed" | "failed" | "dead";

export type OutboxOperation = {
  id: string;
  tenantId: string;
  deviceId: string;
  kind: OutboxOperationKind;
  /** Aligns with server idempotency keys where applicable. */
  idempotencyKey: string | null;
  /** Client-generated dedupe key for exactly-once sync attempts. */
  clientMutationId: string;
  createdAtMs: number;
  updatedAtMs: number;
  attemptCount: number;
  nextAttemptAtMs: number;
  /** Optimistic concurrency hint when mutating server-backed rows. */
  baseServerVersion: number | null;
  status: OutboxOperationStatus;
  payload: unknown;
  lastError: string | null;
};

export type NewOutboxOperation = Omit<
  OutboxOperation,
  "id" | "createdAtMs" | "updatedAtMs" | "attemptCount" | "nextAttemptAtMs" | "status" | "lastError"
> & {
  id?: string;
  clientMutationId?: string;
};

export type PushOpOutcome = "accepted" | "idempotent" | "dropped" | "retry" | "dead";

export type PushOpResult = {
  operationId: string;
  outcome: PushOpOutcome;
  errorMessage?: string;
};

export type SyncConflictStub = {
  operationId: string;
  kind: OutboxOperationKind;
  /** Future: attach server snapshot + merge policy outcome. */
  code: "VERSION_MISMATCH" | "DUPLICATE" | "UNKNOWN";
};

export type PushBatchResult = {
  /** One entry per input operation (same length as `ops` passed to `pushBatch`). */
  perOp: PushOpResult[];
  /** Reserved for server-wins / merge workflows. */
  conflicts: SyncConflictStub[];
};
