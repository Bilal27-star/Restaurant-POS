import type { NewOutboxOperation, OutboxOperation, OutboxOperationStatus } from "./outbox-types.js";

/**
 * Persistence port for the outbox. IndexedDB + SQLite drivers implement this contract.
 */
export interface OutboxStore {
  enqueue(op: NewOutboxOperation): Promise<OutboxOperation>;
  listDue(tenantId: string, nowMs: number): Promise<OutboxOperation[]>;
  listByStatus(tenantId: string, statuses: OutboxOperationStatus[]): Promise<OutboxOperation[]>;
  countPending(tenantId: string): Promise<number>;
  markInFlight(id: string): Promise<void>;
  markCompleted(id: string): Promise<void>;
  markFailedBackoff(id: string, err: unknown, nextAttemptAtMs: number): Promise<void>;
  markDead(id: string, err: unknown): Promise<void>;
  /**
   * Recover from crashes mid-push: stale `in_flight` rows become `pending` again.
   * Implementations should lower `attemptCount` by 1 (min 0) so retries are fair.
   */
  requeueStaleInFlight(tenantId: string, staleBeforeUpdatedAtMs: number): Promise<void>;
}

function nowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stamp(): number {
  return Date.now();
}

/** In-memory outbox (tests + emergency fallback). */
export class MemoryOutboxStore implements OutboxStore {
  private readonly rows = new Map<string, OutboxOperation>();

  async enqueue(op: NewOutboxOperation): Promise<OutboxOperation> {
    const t = stamp();
    const row: OutboxOperation = {
      id: op.id ?? nowId(),
      tenantId: op.tenantId,
      deviceId: op.deviceId,
      kind: op.kind,
      idempotencyKey: op.idempotencyKey ?? null,
      clientMutationId: op.clientMutationId ?? nowId(),
      createdAtMs: t,
      updatedAtMs: t,
      attemptCount: 0,
      nextAttemptAtMs: t,
      baseServerVersion: op.baseServerVersion ?? null,
      status: "pending",
      payload: op.payload,
      lastError: null,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async listDue(tenantId: string, nowMs: number): Promise<OutboxOperation[]> {
    return [...this.rows.values()].filter(
      (r) =>
        r.tenantId === tenantId &&
        ((r.status === "pending" && r.nextAttemptAtMs <= nowMs) ||
          (r.status === "failed" && r.nextAttemptAtMs <= nowMs)),
    );
  }

  async listByStatus(tenantId: string, statuses: OutboxOperationStatus[]): Promise<OutboxOperation[]> {
    const set = new Set(statuses);
    return [...this.rows.values()].filter((r) => r.tenantId === tenantId && set.has(r.status));
  }

  async countPending(tenantId: string): Promise<number> {
    let n = 0;
    for (const r of this.rows.values()) {
      if (r.tenantId === tenantId && (r.status === "pending" || r.status === "in_flight" || r.status === "failed")) {
        n++;
      }
    }
    return n;
  }

  async markInFlight(id: string): Promise<void> {
    const r = this.rows.get(id);
    if (!r) {
      return;
    }
    r.status = "in_flight";
    r.attemptCount += 1;
    r.updatedAtMs = stamp();
    this.rows.set(id, r);
  }

  async markCompleted(id: string): Promise<void> {
    const r = this.rows.get(id);
    if (!r) {
      return;
    }
    r.status = "completed";
    r.updatedAtMs = stamp();
    r.lastError = null;
    this.rows.set(id, r);
  }

  async markFailedBackoff(id: string, err: unknown, nextAttemptAtMs: number): Promise<void> {
    const r = this.rows.get(id);
    if (!r) {
      return;
    }
    r.status = "failed";
    r.lastError = err instanceof Error ? err.message : String(err);
    r.nextAttemptAtMs = nextAttemptAtMs;
    r.updatedAtMs = stamp();
    this.rows.set(id, r);
  }

  async markDead(id: string, err: unknown): Promise<void> {
    const r = this.rows.get(id);
    if (!r) {
      return;
    }
    r.status = "dead";
    r.lastError = err instanceof Error ? err.message : String(err);
    r.updatedAtMs = stamp();
    this.rows.set(id, r);
  }

  async requeueStaleInFlight(tenantId: string, staleBeforeUpdatedAtMs: number): Promise<void> {
    const t = stamp();
    for (const [id, r] of this.rows) {
      if (r.tenantId !== tenantId || r.status !== "in_flight") continue;
      if (r.updatedAtMs >= staleBeforeUpdatedAtMs) continue;
      r.status = "pending";
      r.attemptCount = Math.max(0, r.attemptCount - 1);
      r.nextAttemptAtMs = t;
      r.updatedAtMs = t;
      this.rows.set(id, r);
    }
  }
}
