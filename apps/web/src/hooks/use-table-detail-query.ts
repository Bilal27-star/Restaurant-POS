import { useQuery } from "@tanstack/react-query";

import { getAccessToken, getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

export function useTableDetailQuery(tableId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: tableId ? queryKeys.tables.detail(tableId) : ["tables", "detail", "none"],
    queryFn: () => getAppApi().tables.get(tableId!),
    enabled: Boolean(tableId) && enabled && Boolean(getAccessToken()),
    staleTime: 5_000,
  });
}
