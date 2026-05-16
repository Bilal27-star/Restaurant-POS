import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/auth-context";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { getAppApi, resolvedApiOrigin } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";
import { ApiClientError } from "@pos/api-client";

function tableDetailRetry(failureCount: number, error: unknown): boolean {
  const status = error instanceof ApiClientError ? error.status : undefined;
  if (status === 429) return false;
  if (status != null && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

export function useTableDetailQuery(tableId: string | null, modalOpen: boolean) {
  const { accessToken, ready } = useAuth();
  const enabled = ready && Boolean(accessToken) && Boolean(tableId) && modalOpen;

  return useQuery({
    queryKey: tableId ? queryKeys.tables.detail(tableId) : ["tables", "detail", "none"],
    enabled,
    queryFn: async () => {
      const url = `${resolvedApiOrigin().replace(/\/$/, "")}/api/v1/tables/${tableId}`;
      logDataFlow("tables_detail_fetch_start", { url, tableId });

      try {
        const data = await getAppApi().tables.get(tableId!);
        logDataFlow("tables_detail_fetch_ok", { url, status: 200, tableId });
        return data;
      } catch (err) {
        const status = err instanceof ApiClientError ? err.status : 0;
        logDataFlow("tables_detail_fetch_error", {
          url,
          status,
          throttled: status === 429,
          tableId,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: tableDetailRetry,
  });
}
