import { useMemo } from "react";

import { useAuth } from "./auth-context";

function keyOf(codes: readonly string[]): string {
  return [...codes].sort().join(",");
}

export function usePermission(...requiredAll: string[]): boolean {
  const { user } = useAuth();
  const perms = user?.permissions;
  const reqKey = keyOf(requiredAll);
  return useMemo(() => {
    const set = new Set(perms ?? []);
    return requiredAll.every((p) => set.has(p));
  }, [perms, reqKey]);
}

export function useAnyPermission(...alternatives: string[]): boolean {
  const { user } = useAuth();
  const perms = user?.permissions;
  const altKey = keyOf(alternatives);
  return useMemo(() => {
    if (alternatives.length === 0) return true;
    const set = new Set(perms ?? []);
    return alternatives.some((p) => set.has(p));
  }, [perms, altKey]);
}
