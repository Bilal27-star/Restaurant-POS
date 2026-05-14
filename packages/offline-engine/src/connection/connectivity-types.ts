export type ConnectivityMode = "ONLINE" | "OFFLINE" | "SYNCING";

export type ConnectivitySnapshot = {
  mode: ConnectivityMode;
  lastOnlineAtMs: number | null;
  lastOfflineAtMs: number | null;
  /** Navigator onLine OR heartbeat success. */
  browserReportsOnline: boolean;
  /** Last heartbeat error message if any. */
  lastProbeError: string | null;
  pendingOutboxCount: number;
};
