import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

export function useActiveShiftQuery(enabled = true) {
  return useQuery({
    queryKey: ["shifts", "active"],
    queryFn: async () => {
      try {
        return await getAppApi().shifts.current();
      } catch (e: any) {
        if (e?.status === 404) return null;
        throw e;
      }
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useShiftTransactionsQuery(shiftId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["shifts", shiftId, "transactions"],
    queryFn: async () => {
      if (!shiftId) return [];
      // This assumes the backend has an endpoint for transactions or we use expenses + payments
      // For now, let's look at what the backend provides for shifts
      const data = await getAppApi().shifts.current() as any;
      return data?.transactions ?? [];
    },
    enabled: enabled && !!shiftId,
  });
}

export function useExpenseCategoriesQuery() {
  return useQuery({
    queryKey: ["expenses", "categories"],
    queryFn: () => getAppApi().expenses.categories(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useExpensesQuery(shiftId: string | null) {
  return useQuery({
    queryKey: ["expenses", "list", shiftId],
    queryFn: () => (shiftId ? getAppApi().expenses.list(shiftId) : []),
    enabled: !!shiftId,
  });
}

export function useOpenShiftMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { openingCashFloat: string }) => getAppApi().shifts.open(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useCloseShiftMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ shiftId, body }: { shiftId: string; body: { closingCashCount: string; notes?: string | null } }) =>
      getAppApi().shifts.close(shiftId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
  });
}

export function useCreateExpenseMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => getAppApi().expenses.create(body),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      if (variables.shiftId) {
        qc.invalidateQueries({ queryKey: ["shifts", variables.shiftId, "transactions"] });
      }
    },
  });
}

export function useShiftRefundMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { shiftId: string; amount: string; notes?: string | null }) =>
      getAppApi().shifts.refund(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}
