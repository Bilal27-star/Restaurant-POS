import { useQuery } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";
import type { SerializedTakeawayOrder } from "@/types/serialized-order";

export function useTakeawayOrdersQuery() {
  return useQuery({
    queryKey: queryKeys.orders.takeawayBoard(),
    queryFn: async () => {
      const api = getAppApi();
      const [active, historyCompleted] = await Promise.all([
        api.orders.listActive({ type: "TAKEAWAY" }) as Promise<SerializedTakeawayOrder[]>,
        api.orders.history({
          type: "TAKEAWAY",
          status: "COMPLETED",
          limit: "100",
          offset: "0",
        }) as Promise<SerializedTakeawayOrder[]>,
      ]);
      const seen = new Set(active.map((x) => x.id));
      return [...active, ...historyCompleted.filter((x) => !seen.has(x.id))];
    },
    refetchInterval: 5000,
  });
}
