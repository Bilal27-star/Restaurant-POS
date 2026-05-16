import { QueryCache, QueryClient } from "@tanstack/react-query";

import { logDataFlow } from "@/lib/desktop/data-flow-log";

function queryRetryCount(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const status =
    typeof error === "object" && error !== null && "status" in error && typeof (error as { status: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;
  if (status === 401 || status === 403 || status === 404 || status === 429) return false;
  if (status != null && status >= 400 && status < 500) return false;
  return true;
}

/** Shared React Query client — no placeholder/fallback business data. */
export const appQueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      logDataFlow("query_error", {
        queryKey: query.queryKey,
        message: error instanceof Error ? error.message : String(error),
      });
    },
    onSuccess: (_data, query) => {
      if (query.state.dataUpdateCount === 1) {
        logDataFlow("query_success", { queryKey: query.queryKey });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: queryRetryCount,
    },
    mutations: {
      retry: 0,
    },
  },
});

export function clearAppQueryCache(): void {
  appQueryClient.clear();
}
