import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/auth-context";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import type { AnalyticsDashboardData } from "@/lib/dashboard/dashboard-types";
import { getAppApi, resolvedApiOrigin } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";
import { ApiClientError } from "@pos/api-client";

export type { AnalyticsDashboardData } from "@/lib/dashboard/dashboard-types";

function parseDashboard(raw: unknown): AnalyticsDashboardData | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as AnalyticsDashboardData;
}

function dashboardRetry(failureCount: number, error: unknown): boolean {
  const status = error instanceof ApiClientError ? error.status : undefined;
  if (status === 429) return false;
  if (status != null && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

const DASHBOARD_STALE_MS = 60_000;

export function useAnalyticsDashboard() {
  const { accessToken, ready } = useAuth();
  const enabled = ready && Boolean(accessToken);

  return useQuery({
    queryKey: queryKeys.analytics.dashboard(),
    enabled,
    queryFn: async () => {
      const url = `${resolvedApiOrigin().replace(/\/$/, "")}/api/v1/analytics/dashboard`;
      logDataFlow("dashboard_fetch_start", { url, throttleRisk: false });

      try {
        const raw = await getAppApi().analytics.dashboard();
        const data = parseDashboard(raw);
        if (!data) throw new ApiClientError("INVALID_DASHBOARD_PAYLOAD", 502);

        logDataFlow("dashboard_fetch_ok", {
          url,
          status: 200,
          orders: data.today.ordersOpened,
          revenue: data.today.revenue,
        });
        return data;
      } catch (err) {
        const status = err instanceof ApiClientError ? err.status : 0;
        logDataFlow("dashboard_fetch_error", {
          url,
          status,
          throttled: status === 429,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    staleTime: DASHBOARD_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: false,
    retry: dashboardRetry,
  });
}
