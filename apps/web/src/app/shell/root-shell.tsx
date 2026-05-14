import { AppShell } from "@/components/layout/app-shell";
import { OfflineShellProvider } from "@/offline/offline-runtime-context";
import { useAuth } from "@/auth/auth-context";
import { resolvedApiOrigin } from "@/lib/app-api";
import { useEffect } from "react";

/** Root layout: offline outbox scope, sidebar, top bar, scrollable content, mobile drawer. */
export function RootShell() {
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void (async () => {
      const { isTauriDesktop, installTauriDesktopHost } = await import("@/lib/desktop/tauri-host");
      if (cancelled || !isTauriDesktop()) return;
      cleanup = await installTauriDesktopHost();
      const { startThermalPrintWorker } = await import("@/services/printing/thermal-print-worker");
      startThermalPrintWorker();
    })();
    return () => {
      cancelled = true;
      void import("@/services/printing/thermal-print-worker").then((m) => m.stopThermalPrintWorker());
      cleanup?.();
    };
  }, []);

  return (
    <OfflineShellProvider
      tenantId={user?.restaurantId ?? "anon"}
      apiOrigin={resolvedApiOrigin() || null}
      userPermissions={user?.permissions ?? []}
      enableCloudSync={Boolean(user?.restaurantId)}
    >
      <AppShell />
    </OfflineShellProvider>
  );
}
