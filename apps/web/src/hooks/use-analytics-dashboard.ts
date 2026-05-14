import { useQuery } from "@tanstack/react-query";

import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

export type AnalyticsDashboardData = {
  asOf: string;
  timeZone: string;
  currencyCode: string;
  today: {
    revenue: string;
    ordersOpened: number;
    ordersCompleted: number;
    activeTables: number;
    averageCompletedOrderValue: string | null;
    guestsServed: number;
    completedPayments: number;
    pendingPayments: number;
    openOrders: number;
  };
  peak: {
    topRevenueHourLocal: number | null;
    topRevenueAmount: string;
    topOrdersHourLocal: number | null;
    topOrdersOpened: number;
  };
  hourlyToday: { hourLocal: number; revenue: string; ordersOpened: number }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    type: string;
    status: string;
    paymentStatus: string;
    total: string;
    openedAt: string;
    tableNumber: string | null;
    waiterName: string | null;
  }[];
  topItems: { menuItemId: string | null; name: string; quantity: number; revenue: string }[];
};

function parseDashboard(raw: unknown): AnalyticsDashboardData | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as AnalyticsDashboardData;
}

export function useAnalyticsDashboard() {
  return useQuery({
    queryKey: queryKeys.analytics.dashboard(),
    queryFn: async () => {
      const raw = await getAppApi().analytics.dashboard();
      const data = parseDashboard(raw);
      if (!data) throw new Error("INVALID_DASHBOARD_PAYLOAD");
      return data;
    },
    staleTime: 20_000,
  });
}
