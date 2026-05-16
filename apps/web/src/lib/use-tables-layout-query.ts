import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { getAppApi, resolvedApiOrigin } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";
import { ApiClientError } from "@pos/api-client";

function tablesLayoutRetry(failureCount: number, error: unknown): boolean {
  const status = error instanceof ApiClientError ? error.status : undefined;
  if (status === 429) return false;
  if (status != null && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

const TABLES_LAYOUT_STALE_MS = 30_000;
/** Soft poll on /tables only; Socket.IO invalidations handle rush-hour updates. */
const TABLES_LAYOUT_POLL_MS = 20_000;

export function useTablesLayoutQuery() {
  const { accessToken, ready } = useAuth();
  const { pathname } = useLocation();
  const onTablesRoute = pathname === "/tables" || pathname.startsWith("/tables/");
  const enabled = ready && Boolean(accessToken);

  return useQuery({
    queryKey: queryKeys.tables.layout(),
    enabled,
    queryFn: async () => {
      const url = `${resolvedApiOrigin().replace(/\/$/, "")}/api/v1/tables/layout`;
      logDataFlow("tables_layout_fetch_start", { url });

      try {
        const data = await getAppApi().tables.getLayout();
        logDataFlow("tables_layout_fetch_ok", { url, status: 200 });
        return data;
      } catch (err) {
        const status = err instanceof ApiClientError ? err.status : 0;
        logDataFlow("tables_layout_fetch_error", {
          url,
          status,
          throttled: status === 429,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    staleTime: TABLES_LAYOUT_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: onTablesRoute ? TABLES_LAYOUT_POLL_MS : false,
    retry: tablesLayoutRetry,
  });
}
