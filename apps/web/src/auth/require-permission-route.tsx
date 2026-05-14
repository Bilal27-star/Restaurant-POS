import { PermissionCodes } from "@pos/contracts";
import { Navigate, Outlet } from "react-router-dom";

import { useAnyPermission } from "./use-permission";

export type RequirePermissionRouteProps = {
  /** User must hold at least one of these permission codes (OR). */
  anyOf: string[];
};

/**
 * Server-side RBAC remains authoritative; this hides routes and prevents casual navigation.
 */
export function RequirePermissionRoute({ anyOf }: RequirePermissionRouteProps) {
  const allowed = useAnyPermission(...anyOf);
  if (!allowed) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export { PermissionCodes };
