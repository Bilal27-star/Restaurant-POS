export const RESTAURANT_BACKUP_VERSION = 1 as const;

export type RestaurantBackupPayload = {
  version: typeof RESTAURANT_BACKUP_VERSION;
  exportedAt: string;
  restaurantId: string;
  restaurant: Record<string, unknown>;
  systemSettings: Record<string, unknown> | null;
  users: Record<string, unknown>[];
  userRoles: Record<string, unknown>[];
  floors: Record<string, unknown>[];
  tables: Record<string, unknown>[];
  tableReservations: Record<string, unknown>[];
  menuCategories: Record<string, unknown>[];
  menuItems: Record<string, unknown>[];
  ingredients: Record<string, unknown>[];
  modifiers: Record<string, unknown>[];
  menuItemModifiers: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  printers: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  orderItems: Record<string, unknown>[];
  orderItemModifiers: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  refunds: Record<string, unknown>[];
  shifts: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  cashTransactions: Record<string, unknown>[];
  orderNumberCounters: Record<string, unknown>[];
  expenseCategories: Record<string, unknown>[];
};

export type RestaurantBackupExportResult = {
  filename: string;
  payload: RestaurantBackupPayload;
};

export type RestaurantDataClearResult = {
  deleted: Record<string, number>;
};

export type RestaurantBackupRestoreResult = {
  restored: Record<string, number>;
};
