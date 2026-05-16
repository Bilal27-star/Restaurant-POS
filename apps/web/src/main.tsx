import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, Suspense } from "react";
import { RouteLoadingFallback } from "./components/data/route-loading-fallback";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/auth-context";
import { AppErrorBoundary } from "./components/error-boundary/app-error-boundary";
import { router } from "./app/router";
import { DesktopAppShell } from "./desktop/desktop-app-shell";
import { appQueryClient } from "./lib/app-query-client";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element");
}

createRoot(rootEl).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={appQueryClient}>
        <DesktopAppShell>
          <AuthProvider>
            <Suspense fallback={<RouteLoadingFallback />}>
              <RouterProvider router={router} />
            </Suspense>
          </AuthProvider>
        </DesktopAppShell>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
