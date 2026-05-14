import { useQuery } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

export function useKitchenOrdersQuery() {
  return useQuery({
    queryKey: queryKeys.orders.list({ status: "PREPARING" }),
    queryFn: async () => {
      // List all active orders. The kitchen can then filter for preparing/ready.
      const res = await getAppApi().orders.listActive();
      return res as any[];
    },
    refetchInterval: 5000, // Poll every 5s for kitchen updates
  });
}
