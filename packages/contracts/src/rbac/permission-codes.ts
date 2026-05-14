/**
 * Canonical RBAC permission strings (resource:action).
 * Seeded in DB via `packages/database/prisma/seed.ts` — keep aligned.
 *
 * Human-friendly map:
 * - menu:manage → manage_menu
 * - users:manage → manage_employees
 * - payments:refund → process_refunds (refunds only; capture stays payments:process)
 * - tables:manage → manage_tables
 * - orders:* → manage_orders surface area
 * - analytics:access → access_analytics
 * - shifts:open / shifts:close → open_shift / close_shift
 * - settings:manage / settings:read → manage_settings / read settings
 * - printing:use → print_receipts & thermal queue
 */
export const PermissionCodes = {
  MENU_READ: "menu:read",
  MENU_MANAGE: "menu:manage",
  ORDERS_CREATE: "orders:create",
  ORDERS_READ: "orders:read",
  ORDERS_UPDATE: "orders:update",
  ORDERS_DELETE: "orders:delete",
  PAYMENTS_PROCESS: "payments:process",
  PAYMENTS_REFUND: "payments:refund",
  PRINTING_USE: "printing:use",
  USERS_READ: "users:read",
  USERS_MANAGE: "users:manage",
  ROLES_MANAGE: "roles:manage",
  ANALYTICS_ACCESS: "analytics:access",
  SETTINGS_READ: "settings:read",
  SETTINGS_MANAGE: "settings:manage",
  TABLES_MANAGE: "tables:manage",
  SHIFTS_READ: "shifts:read",
  SHIFTS_OPEN: "shifts:open",
  SHIFTS_CLOSE: "shifts:close",
  EXPENSES_MANAGE: "expenses:manage",
} as const;

export type PermissionCode = (typeof PermissionCodes)[keyof typeof PermissionCodes];
