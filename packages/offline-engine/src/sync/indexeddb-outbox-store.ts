import type { NewOutboxOperation, OutboxOperation, OutboxOperationStatus } from "./outbox-types.js";
import type { OutboxStore } from "./outbox-store.js";

const DB_NAME = "pos_offline_outbox_v1";
const STORE = "ops";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onerror = () => reject(r.error ?? new Error("IndexedDB request failed"));
    r.onsuccess = () => resolve(r.result);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
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

/**
 * Durable outbox for browser offline-first. Mirrors rows expected from the SQLite schema
 * (`SQLITE_OFFLINE_MIGRATION_V1`) for a future Tauri-sidecar migration.
 */
export class IndexedDbOutboxStore implements OutboxStore {
  private async open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") {
      throw new Error("indexedDB is not available in this environment");
    }
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: "id" });
          st.createIndex("byTenant", "tenantId", { unique: false });
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error("IndexedDB open failed"));
    });
  }

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
    const db = await this.open();
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(row);
      await txDone(tx);
      return row;
    } finally {
      db.close();
    }
  }

  async listDue(tenantId: string, nowMs: number): Promise<OutboxOperation[]> {
    const all = await this.allForTenant(tenantId);
    return all.filter(
      (r) =>
        (r.status === "pending" && r.nextAttemptAtMs <= nowMs) ||
        (r.status === "failed" && r.nextAttemptAtMs <= nowMs),
    );
  }

  async listByStatus(tenantId: string, statuses: OutboxOperationStatus[]): Promise<OutboxOperation[]> {
    const set = new Set(statuses);
    const all = await this.allForTenant(tenantId);
    return all.filter((r) => set.has(r.status));
  }

  async countPending(tenantId: string): Promise<number> {
    const all = await this.allForTenant(tenantId);
    return all.filter((r) => r.status === "pending" || r.status === "in_flight" || r.status === "failed").length;
  }

  private async allForTenant(tenantId: string): Promise<OutboxOperation[]> {
    const db = await this.open();
    try {
      const tx = db.transaction(STORE, "readonly");
      const st = tx.objectStore(STORE);
      const idx = st.index("byTenant");
      const range = IDBKeyRange.only(tenantId);
      const rows = await req<OutboxOperation[]>(idx.getAll(range));
      await txDone(tx);
      return rows;
    } finally {
      db.close();
    }
  }

  private async mutate(id: string, fn: (row: OutboxOperation) => void): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      const row = await req<OutboxOperation | undefined>(st.get(id));
      if (!row) {
        await txDone(tx);
        return;
      }
      fn(row);
      st.put(row);
      await txDone(tx);
    } finally {
      db.close();
    }
  }

  async markInFlight(id: string): Promise<void> {
    await this.mutate(id, (r) => {
      r.status = "in_flight";
      r.attemptCount += 1;
      r.updatedAtMs = stamp();
    });
  }

  async markCompleted(id: string): Promise<void> {
    await this.mutate(id, (r) => {
      r.status = "completed";
      r.updatedAtMs = stamp();
      r.lastError = null;
    });
  }

  async markFailedBackoff(id: string, err: unknown, nextAttemptAtMs: number): Promise<void> {
    await this.mutate(id, (r) => {
      r.status = "failed";
      r.lastError = err instanceof Error ? err.message : String(err);
      r.nextAttemptAtMs = nextAttemptAtMs;
      r.updatedAtMs = stamp();
    });
  }

  async markDead(id: string, err: unknown): Promise<void> {
    await this.mutate(id, (r) => {
      r.status = "dead";
      r.lastError = err instanceof Error ? err.message : String(err);
      r.updatedAtMs = stamp();
    });
  }

  async requeueStaleInFlight(tenantId: string, staleBeforeUpdatedAtMs: number): Promise<void> {
    const all = await this.allForTenant(tenantId);
    const t = stamp();
    for (const r of all) {
      if (r.status !== "in_flight" || r.updatedAtMs >= staleBeforeUpdatedAtMs) continue;
      await this.mutate(r.id, (row) => {
        row.status = "pending";
        row.attemptCount = Math.max(0, row.attemptCount - 1);
        row.nextAttemptAtMs = t;
        row.updatedAtMs = t;
      });
    }
  }
}
