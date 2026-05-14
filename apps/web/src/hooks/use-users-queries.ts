import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";

export function useUsersQuery() {
  return useQuery({
    queryKey: ["users", "list"],
    queryFn: async () => {
      const data = await getAppApi().users.list();
      return data as any[];
    },
  });
}

export function useUserMutations() {
  const qc = useQueryClient();

  const createUser = useMutation({
    mutationFn: (body: any) => getAppApi().users.createUser(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users", "list"] });
    },
  });

  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => getAppApi().users.patchUser(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users", "list"] });
    },
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => getAppApi().users.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users", "list"] });
    },
  });

  return { createUser, patchUser, deleteUser };
}
