import type { ComponentType } from "react";
import { PermissionCodes } from "@pos/contracts";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { RequirePermissionRoute } from "../../auth/require-permission-route";
import { RouteLoadingFallback } from "@/components/data/route-loading-fallback";

function lazyPage(importFn: () => Promise<Record<string, ComponentType>>, exportName: string) {
  return async () => {
    const mod = await importFn();
    const Component = mod[exportName];
    if (!Component) {
      throw new Error(`Lazy route export "${exportName}" not found`);
    }
    return { Component };
  };
}

/**
 * Route tree: public login, then auth-gated shell and lazy feature pages.
 * Permission wrappers are static; only page components lazy-load (avoids empty Outlet bugs).
 */
export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: lazyPage(() => import("../../pages/login-page"), "LoginPage"),
    HydrateFallback: RouteLoadingFallback,
  },
  {
    path: "/",
    lazy: lazyPage(() => import("../../auth/auth-gate"), "AuthGate"),
    HydrateFallback: RouteLoadingFallback,
    children: [
      {
        lazy: lazyPage(() => import("../shell/root-shell"), "RootShell"),
        HydrateFallback: RouteLoadingFallback,
        children: [
          {
            index: true,
            lazy: lazyPage(() => import("../../pages/dashboard-page"), "DashboardPage"),
            HydrateFallback: RouteLoadingFallback,
          },
          {
            path: "tables",
            element: (
              <RequirePermissionRoute anyOf={[PermissionCodes.ORDERS_READ, PermissionCodes.TABLES_MANAGE]} />
            ),
            children: [
              {
                index: true,
                lazy: lazyPage(() => import("../../pages/tables-page"), "TablesPage"),
                HydrateFallback: RouteLoadingFallback,
              },
            ],
          },
          {
            path: "orders",
            element: <RequirePermissionRoute anyOf={[PermissionCodes.ORDERS_READ]} />,
            children: [
              {
                index: true,
                lazy: lazyPage(() => import("../../pages/orders-pos-page"), "OrdersPosPage"),
                HydrateFallback: RouteLoadingFallback,
              },
            ],
          },
          {
            path: "kitchen",
            element: <RequirePermissionRoute anyOf={[PermissionCodes.ORDERS_UPDATE]} />,
            children: [
              {
                index: true,
                lazy: lazyPage(() => import("../../pages/kitchen-page"), "KitchenPage"),
                HydrateFallback: RouteLoadingFallback,
              },
            ],
          },
          {
            path: "takeaway",
            element: <RequirePermissionRoute anyOf={[PermissionCodes.ORDERS_READ]} />,
            children: [
              {
                index: true,
                lazy: lazyPage(() => import("../../pages/takeaway-page"), "TakeawayPage"),
                HydrateFallback: RouteLoadingFallback,
              },
            ],
          },
          {
            path: "caisse",
            element: <RequirePermissionRoute anyOf={[PermissionCodes.PAYMENTS_PROCESS]} />,
            children: [
              {
                index: true,
                lazy: lazyPage(() => import("../../pages/caisse-page"), "CaissePage"),
                HydrateFallback: RouteLoadingFallback,
              },
            ],
          },
          {
            path: "analytics",
            element: <RequirePermissionRoute anyOf={[PermissionCodes.ANALYTICS_ACCESS]} />,
            children: [
              {
                index: true,
                lazy: lazyPage(() => import("../../pages/analytics-page"), "AnalyticsPage"),
                HydrateFallback: RouteLoadingFallback,
              },
            ],
          },
          {
            path: "menu",
            element: <RequirePermissionRoute anyOf={[PermissionCodes.MENU_READ]} />,
            children: [
              {
                index: true,
                lazy: lazyPage(() => import("../../pages/menu-management-page"), "MenuManagementPage"),
                HydrateFallback: RouteLoadingFallback,
              },
            ],
          },
          {
            path: "settings",
            element: (
              <RequirePermissionRoute
                anyOf={[PermissionCodes.SETTINGS_READ, PermissionCodes.SETTINGS_MANAGE]}
              />
            ),
            children: [
              {
                index: true,
                lazy: lazyPage(() => import("../../pages/settings-page"), "SettingsPage"),
                HydrateFallback: RouteLoadingFallback,
              },
            ],
          },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
