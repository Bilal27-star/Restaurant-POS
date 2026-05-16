import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/auth-context";
import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

/** Sidebar badge counts from the API (no hardcoded numbers). */
export function useNavCountsQuery() {
  const { accessToken, ready } = useAuth();
  const enabled = ready && Boolean(accessToken);

  return useQuery({
    queryKey: queryKeys.navigation.counts(),
    enabled,
    queryFn: async () => getAppApi().navigation.getCounts(),
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}

/** Returns label for badge/count or undefined when zero / loading / hidden. */
export function formatNavBadgeValue(n: number | undefined): string | undefined {
  if (n == null || !Number.isFinite(n) || n <= 0) return undefined;
  if (n > 99) return "99+";
  return String(n);
}
