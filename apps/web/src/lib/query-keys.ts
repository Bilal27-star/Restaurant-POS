export const queryKeys = {
  tables: {
    layout: () => ["tables", "layout"] as const,
    detail: (tableId: string) => ["tables", "detail", tableId] as const,
  },
  menu: {
    catalog: () => ["menu", "catalog"] as const,
    categories: () => ["menu", "categories"] as const,
    items: () => ["menu", "items"] as const,
    item: (itemId: string) => ["menu", "item", itemId] as const,
  },
  pos: {
    tableBootstrap: (tableId: string) => ["pos", "tableBootstrap", tableId] as const,
  },
  orders: {
    all: () => ["orders"] as const,
    list: (filters: Record<string, unknown>) => ["orders", "list", filters] as const,
    takeawayBoard: () => ["orders", "takeaway-board"] as const,
    takeawayHistory: () => ["orders", "takeaway-history"] as const,
  },
    analytics: {
      overview: (range?: { from?: string; to?: string }) => ["analytics", "overview", range ?? {}] as const,
      dashboard: () => ["analytics", "dashboard"] as const,
      revenue: (p: { from: string; to: string; granularity: string }) => ["analytics", "revenue", p] as const,
      topItems: (p: { from: string; to: string; limit: number }) => ["analytics", "topItems", p] as const,
      payments: (p: { from: string; to: string }) => ["analytics", "payments", p] as const,
      tables: (p: { from: string; to: string }) => ["analytics", "tables", p] as const,
      peakHours: (p: { from: string; to: string }) => ["analytics", "peakHours", p] as const,
    },
  settings: {
    system: () => ["settings", "system"] as const,
  },
  shifts: {
    current: () => ["shifts", "current"] as const,
  },
  expenses: {
    categories: () => ["expenses", "categories"] as const,
    list: (shiftId: string) => ["expenses", "list", shiftId] as const,
  },
  users: {
    list: () => ["users", "list"] as const,
  },
};
