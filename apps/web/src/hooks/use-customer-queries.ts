import { useQuery } from "@tanstack/react-query";

import type { TakeawayCustomer } from "@/components/takeaway/takeaway-customer-types";
import { useAuth } from "@/auth/auth-context";
import { getAppApi } from "@/lib/app-api";
import { posQueryRetry } from "@/lib/pos/pos-query-retry";

export function useCustomerSearchQuery(query: string) {
  const { accessToken, ready } = useAuth();
  const q = query.trim();
  const digits = q.replace(/\D/g, "");
  const needsSearch = q.length >= 2 || digits.length >= 4;
  const enabled = ready && Boolean(accessToken) && needsSearch;

  return useQuery({
    queryKey: ["customers", "search", q],
    queryFn: async () => {
      const res = await getAppApi().customers.search(q);
      return res as TakeawayCustomer[];
    },
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: posQueryRetry,
  });
}
