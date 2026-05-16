import { ShieldAlert } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useOutlet } from "react-router-dom";

import { RouteLoadingFallback } from "@/components/data/route-loading-fallback";
import { logPageRoute } from "@/lib/desktop/page-route-log";
import { useAnyPermission } from "./use-permission";

export type RequirePermissionRouteProps = {
  /** User must hold at least one of these permission codes (OR). */
  anyOf: string[];
};

/**
 * Server-side RBAC remains authoritative; this hides routes and prevents casual navigation.
 * Always renders visible UI (denied card or loading) — never an empty outlet.
 */
export function RequirePermissionRoute({ anyOf }: RequirePermissionRouteProps) {
  const allowed = useAnyPermission(...anyOf);
  const outlet = useOutlet();
  const location = useLocation();

  useEffect(() => {
    logPageRoute("permission_check", {
      path: location.pathname,
      allowed,
      required: anyOf,
    });
  }, [location.pathname, allowed, anyOf]);

  if (!allowed) {
    return (
      <div className="flex min-h-[min(50vh,28rem)] flex-col items-center justify-center gap-4 rounded-2xl border border-amber-500/35 bg-amber-950/20 px-6 py-10 text-center">
        <ShieldAlert className="size-10 text-amber-300" aria-hidden />
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Accès refusé</h2>
          <p className="text-sm text-muted-foreground">
            Votre compte n&apos;a pas la permission requise pour cette page. Contactez un administrateur.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Retour au tableau de bord
        </Link>
      </div>
    );
  }

  if (outlet == null) {
    return <RouteLoadingFallback />;
  }

  return outlet;
}
