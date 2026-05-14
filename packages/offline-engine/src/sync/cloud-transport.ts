import type { PushBatchResult } from "./outbox-types.js";
import type { OutboxOperation } from "./outbox-types.js";

/**
 * Pluggable cloud transport. When null / noop, the POS runs purely local-first.
 * Full implementation will batch to `/api/v1/sync/...` with idempotency headers.
 */
export interface CloudSyncTransport {
  /** When false, `drainOnce` no-ops so local queue accumulates without fake completions. */
  readonly isEnabled: boolean;
  pushBatch(ops: OutboxOperation[]): Promise<PushBatchResult>;
}

export class NoopCloudSyncTransport implements CloudSyncTransport {
  readonly isEnabled = false;
  async pushBatch(ops: OutboxOperation[]): Promise<PushBatchResult> {
    return {
      perOp: ops.map((o) => ({
        operationId: o.id,
        outcome: "dead" as const,
        errorMessage: "cloud transport disabled",
      })),
      conflicts: [],
    };
  }
}
