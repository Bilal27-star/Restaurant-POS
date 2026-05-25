import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getAppApi } from "@/lib/app-api";
import type { ApiPrinter, DiscoveredPrinter } from "@/lib/printing/printer-form-utils";
import { queryKeys } from "@/lib/query-keys";

export function usePrintersQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.printers.list(),
    queryFn: async () => (await getAppApi().print.listPrinters()) as ApiPrinter[],
    enabled,
    staleTime: 15_000,
  });
}

export function usePrinterMutations() {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.printers.list() });
  };

  const createPrinter = useMutation({
    mutationFn: (body: Record<string, unknown>) => getAppApi().print.createPrinter(body),
    onSuccess: invalidate,
  });

  const updatePrinter = useMutation({
    mutationFn: ({ printerId, body }: { printerId: string; body: Record<string, unknown> }) =>
      getAppApi().print.updatePrinter(printerId, body),
    onSuccess: invalidate,
  });

  const deletePrinter = useMutation({
    mutationFn: (printerId: string) => getAppApi().print.deletePrinter(printerId),
    onSuccess: invalidate,
  });

  const discoverNetwork = useMutation({
    mutationFn: async () => (await getAppApi().printers.discover()) as DiscoveredPrinter[],
  });

  const testConnection = useMutation({
    mutationFn: (body: { host: string; port?: number }) => getAppApi().printers.testConnection(body),
  });

  return {
    createPrinter,
    updatePrinter,
    deletePrinter,
    discoverNetwork,
    testConnection,
  };
}
