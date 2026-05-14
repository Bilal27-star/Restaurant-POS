import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";

export function useSystemSettingsQuery() {
  return useQuery({
    queryKey: ["settings", "system"],
    queryFn: async () => {
      const data = await getAppApi().settings.getSystem();
      return data as any;
    },
  });
}

export function useSystemSettingsMutations() {
  const qc = useQueryClient();

  const patchSystemSettings = useMutation({
    mutationFn: (body: any) => getAppApi().settings.patchSystem(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "system"] });
    },
  });

  return { patchSystemSettings };
}
