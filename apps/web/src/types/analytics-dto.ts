/** Mirrors `apps/api` analytics HTTP payloads for strict typing in the web app. */

export type MoneyString = string;

export type AnalyticsOverviewDto = {
  range: { from: string; to: string };
  revenue: MoneyString;
  ordersCount: number;
  activeTables: number;
  averageOrderValue: MoneyString | null;
  distinctCustomers: number;
  paymentMethods: { method: string; total: MoneyString }[];
  topItems: { menuItemId: string | null; name: string; quantity: number; revenue: MoneyString }[];
  categoryMix: { name: string; revenue: MoneyString }[];
  orderTypes: { type: string; orders: number }[];
  peakHoursTop: { hourLocal: number; ordersOpened: number; revenue: MoneyString }[];
};

export type AnalyticsRevenuePointDto = {
  bucketStart: string;
  bucketLabel: string;
  revenue: MoneyString;
  ordersOpened: number;
};

export type AnalyticsRevenueDto = {
  timeZone: string;
  currencyCode: string;
  granularity: string;
  range: { from: string; to: string };
  points: AnalyticsRevenuePointDto[];
};

export type AnalyticsTopItemsDto = {
  range: { from: string; to: string };
  items: { menuItemId: string | null; name: string; quantity: number; revenue: MoneyString }[];
};

export type AnalyticsTablesDto = {
  range: { from: string; to: string };
  live: { occupiedTables: number; totalTables: number };
  completedDineIn: {
    sessions: number;
    averageDurationMinutes: number | null;
    turnoverPerTableDay: number | null;
  };
  busiest: { tableId: string; tableNumber: string; revenue: MoneyString; ordersCount: number }[];
};
