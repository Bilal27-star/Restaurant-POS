export { getPrisma, prisma, resetPrismaClient } from "./client.js";
export { defaultSystemSettingsJson, type DefaultSystemSettings } from "./default-settings.js";
export {
  isLegacyKitchenPrinter,
  isLegacyLinuxUsbCashierPrinter,
  repairLegacyCashierUsbPrinters,
  repairLegacyKitchenPrinters,
  type PrinterRepairRow,
} from "./printer-repair.js";
export {
  RESTAURANT_BACKUP_VERSION,
  clearRestaurantOperationalData,
  exportRestaurantBackup,
  restoreRestaurantBackup,
  type RestaurantBackupExportResult,
  type RestaurantBackupPayload,
  type RestaurantBackupRestoreResult,
  type RestaurantDataClearResult,
} from "./restaurant-backup.js";

// Re-export Prisma namespace, PrismaClient, and all generated enum types
// so consumers can import from "@pos/database" rather than "@prisma/client" directly.
export {
  Prisma,
  PrismaClient,
  // enums
  UserStatus,
  RoleCode,
  TableStatus,
  OrderType,
  OrderStatus,
  OrderPaymentStatus,
  PaymentMethod,
  PaymentStatus,
  ShiftStatus,
  ExpenseCategoryCode,
  CashTransactionType,
  SyncMutationStatus,
  PrinterRole,
  PrintJobKind,
  PrintJobStatus,
  OrderLineMutationKind,
  OrderItemKitchenStatus,
  KitchenPrintIntentStatus,
  KitchenPrintIntentStationStatus,
  KitchenMutationKind,
  KitchenTicketMode,
  OrderItemKitchenAuditEvent,
  KitchenStation,
} from "@prisma/client";
