import type { OfflineLogSink } from "../logging/offline-log.js";
import type { ConnectivitySnapshot } from "./connectivity-types.js";
import type { SyncEngineCoordinator } from "../sync/sync-engine-coordinator.js";

export type ConnectivityControllerOptions = {
  log: OfflineLogSink;
  /** Return pending + failed (retryable) outbox rows for UI + SYNCING transitions. */
  getPendingCount: (tenantId: string) => Promise<number>;
  tenantId: string;
  sync?: SyncEngineCoordinator | null;
  /** Optional: GET this URL with credentials to validate real API reachability (not just Wi‑Fi). */
  heartbeat?: { url: string; intervalMs: number; timeoutMs: number };
};

/**
 * Bridges browser `online` / `offline` events with optional HTTP heartbeat and sync engine.
 */
export class ConnectivityController {
  private snapshot: ConnectivitySnapshot;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** Coalesces rapid online flaps before running a sync drain (when cloud push is enabled). */
  private reconnectFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(s: ConnectivitySnapshot) => void>();

  constructor(private readonly opts: ConnectivityControllerOptions) {
    const t = Date.now();
    this.snapshot = {
      mode: typeof navigator !== "undefined" && navigator.onLine ? "ONLINE" : "OFFLINE",
      lastOnlineAtMs: typeof navigator !== "undefined" && navigator.onLine ? t : null,
      lastOfflineAtMs: typeof navigator !== "undefined" && navigator.onLine ? null : t,
      browserReportsOnline: typeof navigator !== "undefined" ? navigator.onLine : false,
      lastProbeError: null,
      pendingOutboxCount: 0,
    };
  }

  getSnapshot(): ConnectivitySnapshot {
    return { ...this.snapshot };
  }

  subscribe(fn: (s: ConnectivitySnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      fn(snap);
    }
  }

  private async refreshPending(): Promise<void> {
    try {
      this.snapshot.pendingOutboxCount = await this.opts.getPendingCount(this.opts.tenantId);
    } catch (e) {
      this.opts.log.log("warn", "pending outbox count failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private setMode(mode: ConnectivitySnapshot["mode"]): void {
    const t = Date.now();
    this.snapshot.mode = mode;
    if (mode === "ONLINE") {
      this.snapshot.lastOnlineAtMs = t;
    } else if (mode === "OFFLINE") {
      this.snapshot.lastOfflineAtMs = t;
    }
    void this.refreshPending().finally(() => this.emit());
  }

  async notifyManualSyncStart(): Promise<void> {
    this.snapshot.mode = "SYNCING";
    this.emit();
  }

  async notifyManualSyncEnd(): Promise<void> {
    await this.refreshPending();
    this.snapshot.mode = this.snapshot.browserReportsOnline ? "ONLINE" : "OFFLINE";
    this.emit();
  }

  private onBrowserOnline = (): void => {
    this.snapshot.browserReportsOnline = true;
    this.opts.log.log("info", "connectivity: browser online");
    void this.runHeartbeatProbe().finally(() => {
      this.setMode("ONLINE");
      this.scheduleFlushWhenOnline();
    });
  };

  private onBrowserOffline = (): void => {
    this.snapshot.browserReportsOnline = false;
    this.snapshot.lastProbeError = null;
    this.opts.log.log("warn", "connectivity: browser offline");
    this.setMode("OFFLINE");
  };

  private async runHeartbeatProbe(): Promise<void> {
    const hb = this.opts.heartbeat;
    if (!hb || typeof fetch === "undefined") {
      return;
    }
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), hb.timeoutMs);
    try {
      await fetch(hb.url, { method: "GET", credentials: "include", signal: ac.signal });
      this.snapshot.lastProbeError = null;
    } catch (e) {
      this.snapshot.lastProbeError = e instanceof Error ? e.message : String(e);
      this.opts.log.log("warn", "connectivity heartbeat failed", { error: this.snapshot.lastProbeError });
    } finally {
      clearTimeout(to);
    }
  }

  private async flushWhenOnline(): Promise<void> {
    if (!this.opts.sync?.isCloudPushEnabled()) {
      return;
    }
    try {
      await this.notifyManualSyncStart();
      await this.opts.sync.drainOnce(this.opts.tenantId);
    } catch (e) {
      this.opts.log.log("error", "sync drain after reconnect failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      await this.notifyManualSyncEnd();
    }
  }

  private scheduleFlushWhenOnline(): void {
    if (!this.opts.sync?.isCloudPushEnabled()) {
      return;
    }
    if (this.reconnectFlushTimer) {
      clearTimeout(this.reconnectFlushTimer);
    }
    this.reconnectFlushTimer = setTimeout(() => {
      this.reconnectFlushTimer = null;
      void this.flushWhenOnline();
    }, 450);
  }

  start(): void {
    if (typeof window === "undefined") {
      return;
    }
    this.snapshot.browserReportsOnline = navigator.onLine;
    void this.refreshPending().then(() => this.emit());
    window.addEventListener("online", this.onBrowserOnline);
    window.addEventListener("offline", this.onBrowserOffline);

    const hb = this.opts.heartbeat;
    if (hb) {
      this.heartbeatTimer = setInterval(() => {
        if (!navigator.onLine) {
          return;
        }
        void this.runHeartbeatProbe().then(() => this.emit());
      }, hb.intervalMs);
    }
  }

  stop(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.removeEventListener("online", this.onBrowserOnline);
    window.removeEventListener("offline", this.onBrowserOffline);
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectFlushTimer) {
      clearTimeout(this.reconnectFlushTimer);
      this.reconnectFlushTimer = null;
    }
  }
}
