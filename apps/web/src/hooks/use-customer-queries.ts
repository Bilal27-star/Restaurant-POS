import { useQuery } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";

export function useCustomerSearchQuery(query: string) {
  const q = query.trim();
  const digits = q.replace(/\D/g, "");
  const enabled = q.length >= 2 || digits.length >= 4;

  return useQuery({
    queryKey: ["customers", "search", q],
    queryFn: async () => {
      const res = await getAppApi().customers.search(q);
      return res as any[];
    },
    enabled,
    staleTime: 30 * 1000,
  });
}
