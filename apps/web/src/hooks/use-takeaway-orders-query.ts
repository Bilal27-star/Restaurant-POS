import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { getAppApi, resolvedApiOrigin } from "@/lib/app-api";
import { posQueryRetry } from "@/lib/pos/pos-query-retry";
import { queryKeys } from "@/lib/query-keys";
import type { SerializedTakeawayOrder } from "@/types/serialized-order";
import { ApiClientError } from "@pos/api-client";

const TAKEAWAY_BOARD_STALE_MS = 20_000;
/** Soft poll on /takeaway only; Socket.IO order events also invalidate this query. */
const TAKEAWAY_BOARD_POLL_MS = 20_000;

function startOfLocalDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function fetchTakeawayBoard(): Promise<SerializedTakeawayOrder[]> {
  const api = getAppApi();
  const [active, todayCompleted] = await Promise.all([
    api.orders.listActive({ type: "TAKEAWAY" }) as Promise<SerializedTakeawayOrder[]>,
    api.orders.history({
      type: "TAKEAWAY",
      status: "COMPLETED",
      from: startOfLocalDayIso(),
      limit: "50",
      offset: "0",
    }) as Promise<SerializedTakeawayOrder[]>,
  ]);
  const seen = new Set(active.map((x) => x.id));
  return [...active, ...todayCompleted.filter((x) => !seen.has(x.id))];
}

export function useTakeawayOrdersQuery() {
  const { accessToken, ready } = useAuth();
  const { pathname } = useLocation();
  const onTakeawayRoute = pathname === "/takeaway" || pathname.startsWith("/takeaway/");
  const enabled = ready && Boolean(accessToken);

  return useQuery({
    queryKey: queryKeys.orders.takeawayBoard(),
    enabled,
    queryFn: async () => {
      const url = `${resolvedApiOrigin().replace(/\/$/, "")}/api/v1/orders`;
      logDataFlow("takeaway_board_fetch_start", { url });

      try {
        const merged = await fetchTakeawayBoard();
        logDataFlow("takeaway_board_fetch_ok", {
          url,
          status: 200,
          count: merged.length,
        });
        return merged;
      } catch (err) {
        const status = err instanceof ApiClientError ? err.status : 0;
        logDataFlow("takeaway_board_fetch_error", {
          url,
          status,
          throttled: status === 429,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    staleTime: TAKEAWAY_BOARD_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: onTakeawayRoute ? TAKEAWAY_BOARD_POLL_MS : false,
    retry: posQueryRetry,
  });
}
