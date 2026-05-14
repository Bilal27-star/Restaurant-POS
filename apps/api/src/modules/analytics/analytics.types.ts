/** Serializable DTOs for analytics HTTP + dashboard consumers. */

export type MoneyString = string;

export type AnalyticsOverview = {
  range: { from: string; to: string };
  revenue: MoneyString;
  ordersCount: number;
  activeTables: number;
  /** Paid revenue ÷ non-cancelled orders in range; null when there are no orders. */
  averageOrderValue: MoneyString | null;
  /** Distinct customers with at least one non-cancelled order in range (customer_id set). */
  distinctCustomers: number;
  paymentMethods: { method: string; total: MoneyString }[];
  topItems: { menuItemId: string | null; name: string; quantity: number; revenue: MoneyString }[];
  /** Revenue by menu category (order line subtotals, non-cancelled orders). */
  categoryMix: { name: string; revenue: MoneyString }[];
  /** Opened orders in range by order type (non-cancelled). */
  orderTypes: { type: string; orders: number }[];
  /** Top 5 local hours by opened order count in range. */
  peakHoursTop: { hourLocal: number; ordersOpened: number; revenue: MoneyString }[];
};

export type AnalyticsHourlyPoint = {
  hourLocal: number;
  revenue: MoneyString;
  ordersOpened: number;
};

export type AnalyticsDashboardResponse = {
  asOf: string;
  timeZone: string;
  currencyCode: string;
  today: {
    revenue: MoneyString;
    ordersOpened: number;
    ordersCompleted: number;
    activeTables: number;
    averageCompletedOrderValue: MoneyString | null;
    guestsServed: number;
    completedPayments: number;
    pendingPayments: number;
    openOrders: number;
  };
  peak: {
    topRevenueHourLocal: number | null;
    topRevenueAmount: MoneyString;
    topOrdersHourLocal: number | null;
    topOrdersOpened: number;
  };
  hourlyToday: AnalyticsHourlyPoint[];
  recentOrders: {
    id: string;
    orderNumber: string;
    type: string;
    status: string;
    paymentStatus: string;
    total: MoneyString;
    openedAt: string;
    tableNumber: string | null;
    waiterName: string | null;
  }[];
  topItems: {
    menuItemId: string | null;
    name: string;
    quantity: number;
    revenue: MoneyString;
  }[];
};

export type RevenueGranularity = "hour" | "day" | "week";

export type AnalyticsRevenueSeriesPoint = {
  bucketStart: string;
  bucketLabel: string;
  revenue: MoneyString;
  ordersOpened: number;
};

export type AnalyticsRevenueResponse = {
  timeZone: string;
  currencyCode: string;
  granularity: RevenueGranularity;
  range: { from: string; to: string };
  points: AnalyticsRevenueSeriesPoint[];
};

export type AnalyticsTopItemsResponse = {
  range: { from: string; to: string };
  items: {
    menuItemId: string | null;
    name: string;
    quantity: number;
    revenue: MoneyString;
  }[];
};

export type AnalyticsPaymentsResponse = {
  range: { from: string; to: string };
  currencyCode: string;
  completed: {
    count: number;
    totalAmount: MoneyString;
    averageAmount: MoneyString | null;
    byMethod: { method: string; count: number; total: MoneyString }[];
  };
  refunds: { count: number; totalAmount: MoneyString };
  pendingPipeline: { paymentsPending: number; ordersUnpaidOrPartial: number };
};

export type AnalyticsTablesResponse = {
  range: { from: string; to: string };
  live: { occupiedTables: number; totalTables: number };
  completedDineIn: {
    sessions: number;
    averageDurationMinutes: number | null;
    turnoverPerTableDay: number | null;
  };
  busiest: { tableId: string; tableNumber: string; revenue: MoneyString; ordersCount: number }[];
};

export type AnalyticsPeakHoursResponse = {
  timeZone: string;
  range: { from: string; to: string };
  byHour: { hourLocal: number; revenue: MoneyString; ordersOpened: number }[];
  peakRevenueHourLocal: number | null;
  peakOrdersHourLocal: number | null;
};
