import { useQuery } from "@tanstack/react-query";

import { getAccessToken, getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

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

export function usePosTableOrderBootstrap(tableId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: tableId ? queryKeys.pos.tableBootstrap(tableId) : ["pos", "tableBootstrap", "none"],
    queryFn: async () => {
      const tid = tableId!;
      const table = await getAppApi().tables.get(tid);
      const oid = parseActiveOrderId(table);
      const label = parseTableNumber(table);
      if (!oid) {
        return { tableId: tid, tableLabel: label, orderJson: null as unknown | null };
      }
      const orderJson = await getAppApi().orders.get(oid);
      return { tableId: tid, tableLabel: label, orderJson };
    },
    enabled: Boolean(tableId) && enabled && Boolean(getAccessToken()),
    staleTime: 10_000,
  });
}
