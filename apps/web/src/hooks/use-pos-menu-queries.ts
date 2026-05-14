import { useQuery } from "@tanstack/react-query";

import { getAccessToken, getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

export function usePosMenuCategoriesQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.menu.categories(),
    queryFn: () => getAppApi().menu.listCategories(),
    staleTime: 60_000,
    enabled: enabled && Boolean(getAccessToken()),
  });
}

export function usePosMenuItemsQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.menu.items(),
    queryFn: () => getAppApi().menu.listItems(),
    staleTime: 60_000,
    enabled: enabled && Boolean(getAccessToken()),
  });
}
