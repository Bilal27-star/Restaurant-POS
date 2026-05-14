import { useQuery } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";
import type { SerializedTakeawayOrder } from "@/types/serialized-order";

/** Completed and cancelled takeaway orders (last 30 days) for the history tab. */
export function useTakeawayHistoryQuery() {
  return useQuery({
    queryKey: queryKeys.orders.takeawayHistory(),
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return getAppApi().orders.history({
        type: "TAKEAWAY",
        from: from.toISOString(),
        limit: "100",
        offset: "0",
      }) as Promise<SerializedTakeawayOrder[]>;
    },
    staleTime: 30_000,
  });
}
