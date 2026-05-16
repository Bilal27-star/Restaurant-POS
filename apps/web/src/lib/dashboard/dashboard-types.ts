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
