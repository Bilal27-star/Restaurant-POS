import type { OfflineLogSink } from "../logging/offline-log.js";
import {
  computeBackoffMs,
  DEFAULT_RETRY_POLICY,
  logRetryScheduled,
  shouldMarkDead,
  type RetryPolicy,
} from "./retry-policy.js";
import type { CloudSyncTransport } from "./cloud-transport.js";
import type { NewOutboxOperation, OutboxOperation, PushOpOutcome } from "./outbox-types.js";
import type { OutboxStore } from "./outbox-store.js";

export type SyncEngineState = "idle" | "draining" | "paused";

const STALE_IN_FLIGHT_MS = 120_000;

/**
 * Coordinates outbox persistence with (optional) cloud push. Ordered drain, retries,
 * and per-operation outcomes from the transport.
 */
export class SyncEngineCoordinator {
  private state: SyncEngineState = "idle";
  private drainPromise: Promise<void> | null = null;

  constructor(
    private readonly outbox: OutboxStore,
    private readonly transport: CloudSyncTransport,
    private readonly log: OfflineLogSink,
    private readonly retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
    private readonly opts?: {
      /** When set, blocks enqueue for operations the user is not allowed to perform offline. */
      assertEnqueueAllowed?: (op: NewOutboxOperation) => void;
    },
  ) {}

  getState(): SyncEngineState {
    return this.state;
  }

  isCloudPushEnabled(): boolean {
    return this.transport.isEnabled;
  }

  async enqueue(op: NewOutboxOperation): Promise<OutboxOperation> {
    this.opts?.assertEnqueueAllowed?.(op);
    const row = await this.outbox.enqueue(op);
    this.log.log("info", "outbox enqueue", {
      id: row.id,
      kind: row.kind,
      tenantId: row.tenantId,
      status: row.status,
    });
    return row;
  }

  pause(): void {
    this.state = "paused";
  }

  resume(): void {
    if (this.state === "paused") {
      this.state = "idle";
    }
  }

  /**
   * Drain pass: recover stale in-flight rows, then push due operations **one at a time**
   * in creation order to preserve ordering and partial progress.
   */
  async drainOnce(tenantId: string): Promise<void> {
    if (this.state === "paused") {
      return;
    }
    if (this.drainPromise) {
      return this.drainPromise;
    }
    this.state = "draining";
    this.drainPromise = (async () => {
      try {
        if (!this.transport.isEnabled) {
          this.log.log("debug", "sync drain skipped (cloud transport disabled)");
          return;
        }
        await this.outbox.requeueStaleInFlight(tenantId, Date.now() - STALE_IN_FLIGHT_MS);

        const due = await this.outbox.listDue(tenantId, Date.now());
        const sorted = [...due].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));

        let processed = 0;
        for (const op of sorted) {
          if (op.kind === "print.job") {
            await this.outbox.markCompleted(op.id);
            continue;
          }

          await this.outbox.markInFlight(op.id);

          let outcomes: { operationId: string; outcome: PushOpOutcome; errorMessage?: string }[];
          try {
            const result = await this.transport.pushBatch([op]);
            outcomes = result.perOp;
          } catch (e) {
            await this.failOrDead(op, e);
            continue;
          }

          const row = outcomes.find((x) => x.operationId === op.id);
          if (!row) {
            await this.failOrDead(op, new Error("transport returned no perOp result"));
            continue;
          }

          await this.applyOutcome(op, row.outcome, row.errorMessage);
          processed += 1;
          if (processed % 12 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      } finally {
        this.state = "idle";
        this.drainPromise = null;
      }
    })();
    return this.drainPromise;
  }

  private async applyOutcome(op: OutboxOperation, outcome: PushOpOutcome, msg?: string): Promise<void> {
    switch (outcome) {
      case "accepted":
      case "idempotent":
      case "dropped":
        await this.outbox.markCompleted(op.id);
        this.log.log("info", "outbox pushed", { id: op.id, kind: op.kind, outcome });
        return;
      case "dead":
        await this.outbox.markDead(op.id, new Error(msg || "dead"));
        this.log.log("error", "outbox dead letter", { id: op.id, kind: op.kind, error: msg });
        return;
      case "retry":
        await this.failOrDead(op, new Error(msg || "retry"));
        return;
      default:
        await this.failOrDead(op, new Error(`unknown push outcome: ${String(outcome)}`));
    }
  }

  private async failOrDead(op: OutboxOperation, err: unknown): Promise<void> {
    const nextAttempt = op.attemptCount + 1;
    if (shouldMarkDead(this.retryPolicy, nextAttempt)) {
      await this.outbox.markDead(op.id, err);
      this.log.log("error", "outbox dead letter", {
        id: op.id,
        kind: op.kind,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    const delay = computeBackoffMs(this.retryPolicy, nextAttempt);
    logRetryScheduled(this.log, op.id, nextAttempt, delay, err);
    await this.outbox.markFailedBackoff(op.id, err, Date.now() + delay);
  }
}
