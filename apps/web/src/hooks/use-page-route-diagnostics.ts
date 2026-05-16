import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { logPageRoute } from "@/lib/desktop/page-route-log";

/** Logs route mount/unmount for desktop debugging of blank-page issues. */
export function usePageRouteDiagnostics(pageName: string): void {
  const { pathname } = useLocation();

  useEffect(() => {
    logPageRoute("mount", { pageName, pathname });
    return () => {
      logPageRoute("unmount", { pageName, pathname });
    };
  }, [pageName, pathname]);
}
