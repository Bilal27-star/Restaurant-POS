import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/auth-context";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { getAppApi, resolvedApiOrigin } from "@/lib/app-api";
import { posQueryRetry } from "@/lib/pos/pos-query-retry";
import { queryKeys } from "@/lib/query-keys";
import { ApiClientError } from "@pos/api-client";

function parseActiveOrderId(tableJson: unknown): string | null {
  if (!tableJson || typeof tableJson !== "object") return null;
  const ao = (tableJson as Record<string, unknown>).activeOrder;
  if (!ao || typeof ao !== "object") return null;
  const id = (ao as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

function parseTableNumber(tableJson: unknown): string {
  if (!tableJson || typeof tableJson !== "object") return "";
  const n = (tableJson as Record<string, unknown>).number;
  return typeof n === "string" ? n : "";
}

export function usePosTableOrderBootstrap(tableId: string | null) {
  const { accessToken, ready } = useAuth();
  const enabled = ready && Boolean(accessToken) && Boolean(tableId);

  return useQuery({
    queryKey: tableId ? queryKeys.pos.tableBootstrap(tableId) : ["pos", "tableBootstrap", "none"],
    enabled,
    queryFn: async () => {
      const tid = tableId!;
      const tableUrl = `${resolvedApiOrigin().replace(/\/$/, "")}/api/v1/tables/${tid}`;
      logDataFlow("pos_table_bootstrap_start", { tableId: tid, url: tableUrl });

      try {
        const table = await getAppApi().tables.get(tid);
        const oid = parseActiveOrderId(table);
        const label = parseTableNumber(table);
        if (!oid) {
          logDataFlow("pos_table_bootstrap_ok", { tableId: tid, status: 200, hasOrder: false });
          return { tableId: tid, tableLabel: label, orderJson: null as unknown | null };
        }
        const orderJson = await getAppApi().orders.get(oid);
        logDataFlow("pos_table_bootstrap_ok", { tableId: tid, status: 200, hasOrder: true, orderId: oid });
        return { tableId: tid, tableLabel: label, orderJson };
      } catch (err) {
        const status = err instanceof ApiClientError ? err.status : 0;
        logDataFlow("pos_table_bootstrap_error", {
          tableId: tid,
          status,
          throttled: status === 429,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: posQueryRetry,
  });
}
