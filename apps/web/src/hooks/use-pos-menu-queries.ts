import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/auth-context";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { getAppApi, resolvedApiOrigin } from "@/lib/app-api";
import { parseMenuFromCatalog } from "@/lib/pos-menu-api";
import { posQueryRetry } from "@/lib/pos/pos-query-retry";
import { queryKeys } from "@/lib/query-keys";
import { ApiClientError } from "@pos/api-client";

const POS_MENU_STALE_MS = 60_000;

export type PosMenuData = ReturnType<typeof parseMenuFromCatalog>;

/**
 * Single catalog fetch for the POS workspace (categories + products in one request).
 * Replaces parallel listCategories + listItems to avoid rate-limit storms.
 */
export function usePosMenuQuery() {
  const { accessToken, ready } = useAuth();
  const enabled = ready && Boolean(accessToken);

  return useQuery({
    queryKey: queryKeys.menu.catalog(),
    enabled,
    queryFn: async () => {
      const url = `${resolvedApiOrigin().replace(/\/$/, "")}/api/v1/menu/catalog`;
      logDataFlow("pos_menu_fetch_start", { url });

      try {
        const raw = await getAppApi().menu.getCatalog();
        const parsed = parseMenuFromCatalog(raw);
        logDataFlow("pos_menu_fetch_ok", {
          url,
          status: 200,
          categories: parsed.categories.length,
          items: parsed.items.length,
        });
        return parsed;
      } catch (err) {
        const status = err instanceof ApiClientError ? err.status : 0;
        logDataFlow("pos_menu_fetch_error", {
          url,
          status,
          throttled: status === 429,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    staleTime: POS_MENU_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: false,
    retry: posQueryRetry,
  });
}

/** @deprecated Use usePosMenuQuery — kept for any legacy imports. */
export function usePosMenuCategoriesQuery(_enabled?: boolean) {
  const q = usePosMenuQuery();
  return { ...q, data: q.data?.categories };
}

/** @deprecated Use usePosMenuQuery — kept for any legacy imports. */
export function usePosMenuItemsQuery(_enabled?: boolean) {
  const q = usePosMenuQuery();
  return { ...q, data: q.data?.items };
}
