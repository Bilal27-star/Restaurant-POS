import * as React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";

export function AuthGate() {
  const { accessToken, ready } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
