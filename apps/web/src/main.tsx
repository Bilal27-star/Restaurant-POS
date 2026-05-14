import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth/auth-context";
import { AppErrorBoundary } from "./components/error-boundary/app-error-boundary";
import { router } from "./app/router";
import "./index.css";

function queryRetryCount(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const status =
    typeof error === "object" && error !== null && "status" in error && typeof (error as { status: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;
  if (status === 401 || status === 403 || status === 404) return false;
  if (status != null && status >= 400 && status < 500) return false;
  return true;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** POS is kiosk-like: avoid refetch storms on focus during service. */
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: queryRetryCount,
    },
    mutations: {
      retry: 0,
    },
  },
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element");
}

createRoot(rootEl).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
