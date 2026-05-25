import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

export function useSettingsDataMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.system() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.printers.list() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.catalog() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.categories() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.menu.items() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tables.layout() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users.list() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() }),
    ]);
  };

  const exportBackup = useMutation({
    mutationFn: () => getAppApi().settings.exportBackup(),
  });

  const restoreBackup = useMutation({
    mutationFn: (body: unknown) => getAppApi().settings.restoreBackup(body),
    onSuccess: invalidateAll,
  });

  const clearOperationalData = useMutation({
    mutationFn: () => getAppApi().settings.clearOperationalData(),
    onSuccess: invalidateAll,
  });

  return {
    exportBackup,
    restoreBackup,
    clearOperationalData,
  };
}
