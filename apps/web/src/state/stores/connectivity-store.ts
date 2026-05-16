import type { ConnectivitySnapshot } from "@pos/offline-engine";
import { create } from "zustand";

type ConnectivityState = ConnectivitySnapshot & {
  applySnapshot: (s: ConnectivitySnapshot) => void;
};

const defaultConnectivitySnapshot: ConnectivitySnapshot = {
  mode: typeof navigator !== "undefined" && navigator.onLine ? "ONLINE" : "OFFLINE",
  lastOnlineAtMs: null,
  lastOfflineAtMs: null,
  browserReportsOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  lastProbeError: null,
  pendingOutboxCount: 0,
};

function snapshotsEqual(a: ConnectivitySnapshot, b: ConnectivitySnapshot): boolean {
  return (
    a.mode === b.mode &&
    a.lastOnlineAtMs === b.lastOnlineAtMs &&
    a.lastOfflineAtMs === b.lastOfflineAtMs &&
    a.browserReportsOnline === b.browserReportsOnline &&
    a.lastProbeError === b.lastProbeError &&
    a.pendingOutboxCount === b.pendingOutboxCount
  );
}

function pickSnapshot(x: ConnectivityState): ConnectivitySnapshot {
  return {
    mode: x.mode,
    lastOnlineAtMs: x.lastOnlineAtMs,
    lastOfflineAtMs: x.lastOfflineAtMs,
    browserReportsOnline: x.browserReportsOnline,
    lastProbeError: x.lastProbeError,
    pendingOutboxCount: x.pendingOutboxCount,
  };
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  ...defaultConnectivitySnapshot,
  /** Merge snapshot fields so action methods are never dropped from store state. */
  applySnapshot: (s) =>
    set((prev) => {
      const next: ConnectivitySnapshot = {
        mode: s.mode,
        lastOnlineAtMs: s.lastOnlineAtMs,
        lastOfflineAtMs: s.lastOfflineAtMs,
        browserReportsOnline: s.browserReportsOnline,
        lastProbeError: s.lastProbeError,
        pendingOutboxCount: s.pendingOutboxCount,
      };
      if (snapshotsEqual(pickSnapshot(prev), next)) {
        return prev;
      }
      return { ...prev, ...next };
    }),
}));
