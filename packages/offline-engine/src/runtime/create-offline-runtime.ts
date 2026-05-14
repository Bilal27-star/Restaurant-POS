import { ConnectivityController } from "../connection/connectivity-controller.js";
import { createConsoleOfflineLogSink } from "../logging/offline-log.js";
import { detectHostRuntime } from "./host-environment.js";
import { NoopCloudSyncTransport, type CloudSyncTransport } from "../sync/cloud-transport.js";
import { IndexedDbOutboxStore } from "../sync/indexeddb-outbox-store.js";
import { assertOutboxEnqueueAllowed } from "../sync/outbox-permission-map.js";
import type { OutboxStore } from "../sync/outbox-store.js";
import { MemoryOutboxStore } from "../sync/outbox-store.js";
import { DEFAULT_RETRY_POLICY } from "../sync/retry-policy.js";
import { SyncEngineCoordinator } from "../sync/sync-engine-coordinator.js";

export type OfflineRuntime = {
  log: ReturnType<typeof createConsoleOfflineLogSink>;
  outbox: OutboxStore;
  sync: SyncEngineCoordinator;
  connectivity: ConnectivityController;
  dispose: () => void;
};

const DEVICE_KEY = "pos:device_id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return "ssr-device";
  }
  const existing = window.localStorage.getItem(DEVICE_KEY);
  if (existing) {
    return existing;
  }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-dev`;
  window.localStorage.setItem(DEVICE_KEY, id);
  return id;
}

export type CreateOfflineRuntimeOptions = {
  tenantId: string;
  /** e.g. `https://api.example.com` — when set, enables periodic `/health` reachability probes. */
  apiOrigin?: string | null;
  /** Current user's permission codes (from JWT / `/auth/me`) — required for offline outbox RBAC. */
  userPermissions?: readonly string[];
  /** When set (and enabled), queued mutations are pushed to the API in order. */
  cloudTransport?: CloudSyncTransport | null;
};

/**
 * Single composition root for browser POS: durable outbox + disabled cloud transport + connectivity probes.
 */
export function createOfflineRuntime(opts: CreateOfflineRuntimeOptions): OfflineRuntime {
  const log = createConsoleOfflineLogSink();
  const rt = detectHostRuntime();
  const outbox =
    rt === "browser" && typeof indexedDB !== "undefined" ? new IndexedDbOutboxStore() : new MemoryOutboxStore();
  const transport: CloudSyncTransport = opts.cloudTransport ?? new NoopCloudSyncTransport();
  const perms = opts.userPermissions ?? [];
  const sync = new SyncEngineCoordinator(outbox, transport, log, DEFAULT_RETRY_POLICY, {
    assertEnqueueAllowed: (op) => assertOutboxEnqueueAllowed(op.kind, perms),
  });
  const heartbeat =
    opts.apiOrigin && typeof fetch !== "undefined"
      ? {
          url: `${opts.apiOrigin.replace(/\/$/, "")}/health`,
          intervalMs: 60_000,
          timeoutMs: 8_000,
        }
      : undefined;
  const connectivity = new ConnectivityController({
    log,
    tenantId: opts.tenantId,
    getPendingCount: (tid) => outbox.countPending(tid),
    sync,
    heartbeat,
  });
  connectivity.start();
  return {
    log,
    outbox,
    sync,
    connectivity,
    dispose: () => connectivity.stop(),
  };
}
