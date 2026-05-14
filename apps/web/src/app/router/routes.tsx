import { PermissionCodes } from "@pos/contracts";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { RequirePermissionRoute } from "../../auth/require-permission-route";

const tablesRoute = async () => {
  const { TablesPage } = await import("../../pages/tables-page");
  return {
    element: <RequirePermissionRoute anyOf={[PermissionCodes.ORDERS_READ, PermissionCodes.TABLES_MANAGE]} />,
    children: [{ index: true, Component: TablesPage }],
  };
};

const takeawayRoute = async () => {
  const { TakeawayPage } = await import("../../pages/takeaway-page");
  return {
    element: <RequirePermissionRoute anyOf={[PermissionCodes.ORDERS_READ]} />,
    children: [{ index: true, Component: TakeawayPage }],
  };
};

const caisseRoute = async () => {
  const { CaissePage } = await import("../../pages/caisse-page");
  return {
    element: <RequirePermissionRoute anyOf={[PermissionCodes.PAYMENTS_PROCESS]} />,
    children: [{ index: true, Component: CaissePage }],
  };
};

const kitchenRoute = async () => {
  const { KitchenPage } = await import("../../pages/kitchen-page");
  return {
    element: <RequirePermissionRoute anyOf={[PermissionCodes.ORDERS_UPDATE]} />,
    children: [{ index: true, Component: KitchenPage }],
  };
};

const analyticsRoute = async () => {
  const { AnalyticsPage } = await import("../../pages/analytics-page");
  return {
    element: <RequirePermissionRoute anyOf={[PermissionCodes.ANALYTICS_ACCESS]} />,
    children: [{ index: true, Component: AnalyticsPage }],
  };
};

const menuRoute = async () => {
  const { MenuManagementPage } = await import("../../pages/menu-management-page");
  return {
    element: <RequirePermissionRoute anyOf={[PermissionCodes.MENU_READ]} />,
    children: [{ index: true, Component: MenuManagementPage }],
  };
};

const settingsRoute = async () => {
  const { SettingsPage } = await import("../../pages/settings-page");
  return {
    element: <RequirePermissionRoute anyOf={[PermissionCodes.SETTINGS_READ, PermissionCodes.SETTINGS_MANAGE]} />,
    children: [{ index: true, Component: SettingsPage }],
  };
};

/**
 * Route tree: public login, then auth-gated shell and lazy feature pages.
 */
export const router = createBrowserRouter([
  {
    path: "/login",
    lazy: async () => {
      const { LoginPage } = await import("../../pages/login-page");
      return { Component: LoginPage };
    },
  },
  {
    path: "/",
    lazy: async () => {
      const { AuthGate } = await import("../../auth/auth-gate");
      return { Component: AuthGate };
    },
    children: [
      {
        lazy: async () => {
          const { RootShell } = await import("../shell/root-shell");
          return { Component: RootShell };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const { DashboardPage } = await import("../../pages/dashboard-page");
              return { Component: DashboardPage };
            },
          },
          { path: "tables", lazy: tablesRoute },
          {
            path: "orders",
            lazy: async () => {
              const { OrdersPosPage } = await import("../../pages/orders-pos-page");
              return {
                element: <RequirePermissionRoute anyOf={[PermissionCodes.ORDERS_READ]} />,
                children: [{ index: true, Component: OrdersPosPage }],
              };
            },
          },
          { path: "kitchen", lazy: kitchenRoute },
          { path: "takeaway", lazy: takeawayRoute },
          { path: "caisse", lazy: caisseRoute },
          { path: "analytics", lazy: analyticsRoute },
          { path: "menu", lazy: menuRoute },
          { path: "settings", lazy: settingsRoute },
        ],
      },
    ],
  },
]);
