import { useQuery } from "@tanstack/react-query";

import { getAccessToken, getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

export function useMenuCatalogQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.menu.catalog(),
    queryFn: () => getAppApi().menu.getCatalog(),
    staleTime: 60_000,
    enabled: enabled && Boolean(getAccessToken()),
  });
}
