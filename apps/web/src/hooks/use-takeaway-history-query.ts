import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/auth-context";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { getAppApi, resolvedApiOrigin } from "@/lib/app-api";
import { posQueryRetry } from "@/lib/pos/pos-query-retry";
import { queryKeys } from "@/lib/query-keys";
import type { SerializedTakeawayOrder } from "@/types/serialized-order";
import { ApiClientError } from "@pos/api-client";

const TAKEAWAY_HISTORY_STALE_MS = 60_000;

/** Completed/cancelled takeaway orders — fetched only when the history tab is open. */
export function useTakeawayHistoryQuery(enabled: boolean) {
  const { accessToken, ready } = useAuth();
  const queryEnabled = ready && Boolean(accessToken) && enabled;

  return useQuery({
    queryKey: queryKeys.orders.takeawayHistory(),
    enabled: queryEnabled,
    queryFn: async () => {
      const url = `${resolvedApiOrigin().replace(/\/$/, "")}/api/v1/orders/history`;
      logDataFlow("takeaway_history_fetch_start", { url });

      try {
        const from = new Date();
        from.setDate(from.getDate() - 30);
        const data = (await getAppApi().orders.history({
          type: "TAKEAWAY",
          from: from.toISOString(),
          limit: "100",
          offset: "0",
        })) as SerializedTakeawayOrder[];
        logDataFlow("takeaway_history_fetch_ok", { url, status: 200, count: data.length });
        return data;
      } catch (err) {
        const status = err instanceof ApiClientError ? err.status : 0;
        logDataFlow("takeaway_history_fetch_error", {
          url,
          status,
          throttled: status === 429,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    staleTime: TAKEAWAY_HISTORY_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: posQueryRetry,
  });
}
