import { useQuery } from "@tanstack/react-query";

import { getAccessToken, getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

export function useTablesLayoutQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tables.layout(),
    queryFn: () => getAppApi().tables.getLayout(),
    staleTime: 15_000,
    refetchInterval: 5_000,
    enabled: enabled && Boolean(getAccessToken()),
  });
}
