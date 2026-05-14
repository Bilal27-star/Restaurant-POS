import { createOfflineRuntime, type CloudSyncTransport, type OfflineRuntime } from "@pos/offline-engine";
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import { migrateLegacyPendingOrdersToOutbox } from "@/offline/migrate-legacy-pending-orders";
import { createPosRestCloudTransport } from "@/offline/pos-rest-cloud-transport";
import { getAppApi } from "@/lib/app-api";
import { useConnectivityStore } from "@/state/stores/connectivity-store";

const OfflineRuntimeContext = createContext<OfflineRuntime | null>(null);

export type OfflineShellProviderProps = {
  children: ReactNode;
  /** Restaurant / tenant scope for outbox + sync (align with API `restaurantId`). */
  tenantId: string;
  /** API origin for `/health` probes, e.g. `http://localhost:4000`. Omit to skip heartbeat. */
  apiOrigin?: string | null;
  /** Effective permission codes for offline mutation enqueue (must mirror JWT). */
  userPermissions?: readonly string[];
  /** When true, push queued mutations to the REST API (requires auth + tenant). */
  enableCloudSync?: boolean;
  /** Override cloud transport (tests). Defaults to REST transport when `enableCloudSync` is true. */
  cloudTransport?: CloudSyncTransport | null;
};

/**
 * Wires durable outbox, optional REST cloud transport, connectivity observer, and Zustand mirror.
 */
export function OfflineShellProvider({
  children,
  tenantId,
  apiOrigin,
  userPermissions,
  enableCloudSync = false,
  cloudTransport: cloudTransportOverride,
}: OfflineShellProviderProps) {
  const permKey = userPermissions?.join("|") ?? "";
  const cloudTransport = useMemo(() => {
    if (cloudTransportOverride !== undefined) {
      return cloudTransportOverride;
    }
    if (!enableCloudSync || tenantId === "anon") {
      return undefined;
    }
    return createPosRestCloudTransport(() => getAppApi());
  }, [cloudTransportOverride, enableCloudSync, tenantId]);

  const runtime = useMemo(
    () => createOfflineRuntime({ tenantId, apiOrigin, userPermissions, cloudTransport }),
    [tenantId, apiOrigin, permKey, cloudTransport],
  );
  /** One subscription per runtime instance; avoids effect churn if store actions were ever re-created. */
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  useEffect(() => {
    return () => runtime.dispose();
  }, [runtime]);

  const migratedTenantRef = useRef<string | null>(null);
  useEffect(() => {
    if (tenantId === "anon") {
      migratedTenantRef.current = null;
      return;
    }
    if (migratedTenantRef.current === tenantId) return;
    migratedTenantRef.current = tenantId;
    void migrateLegacyPendingOrdersToOutbox(tenantId, runtimeRef.current.sync);
  }, [tenantId]);

  useEffect(() => {
    const unsub = runtimeRef.current.connectivity.subscribe((snap) => {
      useConnectivityStore.getState().applySnapshot(snap);
    });
    return unsub;
  }, [runtime]);

  return <OfflineRuntimeContext.Provider value={runtime}>{children}</OfflineRuntimeContext.Provider>;
}

export function useOfflineRuntime(): OfflineRuntime {
  const ctx = useContext(OfflineRuntimeContext);
  if (!ctx) {
    throw new Error("useOfflineRuntime must be used within OfflineShellProvider");
  }
  return ctx;
}
