import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

import type { ApiUserListRow } from "@/lib/users/user-form-utils";

export function useUsersQuery() {
  return useQuery({
    queryKey: queryKeys.users.list(),
    queryFn: async (): Promise<ApiUserListRow[]> => {
      const data = await getAppApi().users.list();
      return data as ApiUserListRow[];
    },
  });
}

export function useUserMutations() {
  const qc = useQueryClient();

  const createUser = useMutation({
    mutationFn: (body: Record<string, unknown>) => getAppApi().users.createUser(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.users.list() });
    },
  });

  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => getAppApi().users.patchUser(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.users.list() });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => getAppApi().users.deleteUser(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.users.list() });
    },
  });

  return { createUser, patchUser, deleteUser };
}
