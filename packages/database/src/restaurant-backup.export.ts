import type { PrismaClient } from "@prisma/client";

import {
  RESTAURANT_BACKUP_VERSION,
  type RestaurantBackupExportResult,
  type RestaurantBackupPayload,
} from "./restaurant-backup.types.js";

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object") {
    if (typeof (value as { toFixed?: unknown }).toFixed === "function") {
      return (value as { toFixed: (n: number) => string }).toFixed(2);
    }
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function serializeRows<T>(rows: T[]): Record<string, unknown>[] {
  return JSON.parse(JSON.stringify(rows, jsonReplacer)) as Record<string, unknown>[];
}

function serializeRow<T>(row: T | null): Record<string, unknown> | null {
  if (!row) return null;
  return JSON.parse(JSON.stringify(row, jsonReplacer)) as Record<string, unknown>;
}

export async function exportRestaurantBackup(
  prisma: PrismaClient,
  restaurantId: string,
): Promise<RestaurantBackupExportResult> {
  const [
    restaurant,
    systemSettings,
    users,
    userRoles,
    floors,
    tables,
    tableReservations,
    menuCategories,
    menuItems,
    ingredients,
    modifiers,
    menuItemModifiers,
    customers,
    printers,
    orders,
    orderItems,
    orderItemModifiers,
    payments,
    refunds,
    shifts,
    expenses,
    cashTransactions,
    orderNumberCounters,
    expenseCategories,
  ] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId } }),
    prisma.systemSettings.findUnique({ where: { restaurantId } }),
    prisma.user.findMany({ where: { restaurantId, deletedAt: null } }),
    prisma.userRole.findMany({ where: { user: { restaurantId } } }),
    prisma.restaurantFloor.findMany({ where: { restaurantId, deletedAt: null } }),
    prisma.restaurantTable.findMany({ where: { restaurantId, deletedAt: null } }),
    prisma.tableReservation.findMany({ where: { table: { restaurantId } } }),
    prisma.menuCategory.findMany({ where: { restaurantId, deletedAt: null } }),
    prisma.menuItem.findMany({ where: { restaurantId, deletedAt: null } }),
    prisma.ingredient.findMany({ where: { menuItem: { restaurantId, deletedAt: null } } }),
    prisma.modifier.findMany({ where: { menuItem: { restaurantId, deletedAt: null } } }),
    prisma.menuItemModifier.findMany({ where: { menuItem: { restaurantId, deletedAt: null } } }),
    prisma.customer.findMany({ where: { restaurantId, deletedAt: null } }),
    prisma.restaurantPrinter.findMany({ where: { restaurantId } }),
    prisma.order.findMany({ where: { restaurantId } }),
    prisma.orderItem.findMany({ where: { order: { restaurantId } } }),
    prisma.orderItemModifier.findMany({ where: { orderItem: { order: { restaurantId } } } }),
    prisma.payment.findMany({ where: { restaurantId } }),
    prisma.refund.findMany({ where: { order: { restaurantId } } }),
    prisma.shift.findMany({ where: { restaurantId } }),
    prisma.expense.findMany({ where: { restaurantId } }),
    prisma.cashTransaction.findMany({ where: { restaurantId } }),
    prisma.orderNumberCounter.findMany({ where: { restaurantId } }),
    prisma.expenseCategory.findMany({ where: { restaurantId } }),
  ]);

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  const exportedAt = new Date().toISOString();
  const payload: RestaurantBackupPayload = {
    version: RESTAURANT_BACKUP_VERSION,
    exportedAt,
    restaurantId,
    restaurant: serializeRow(restaurant)!,
    systemSettings: serializeRow(systemSettings),
    users: serializeRows(users),
    userRoles: serializeRows(userRoles),
    floors: serializeRows(floors),
    tables: serializeRows(tables),
    tableReservations: serializeRows(tableReservations),
    menuCategories: serializeRows(menuCategories),
    menuItems: serializeRows(menuItems),
    ingredients: serializeRows(ingredients),
    modifiers: serializeRows(modifiers),
    menuItemModifiers: serializeRows(menuItemModifiers),
    customers: serializeRows(customers),
    printers: serializeRows(printers),
    orders: serializeRows(orders),
    orderItems: serializeRows(orderItems),
    orderItemModifiers: serializeRows(orderItemModifiers),
    payments: serializeRows(payments),
    refunds: serializeRows(refunds),
    shifts: serializeRows(shifts),
    expenses: serializeRows(expenses),
    cashTransactions: serializeRows(cashTransactions),
    orderNumberCounters: serializeRows(orderNumberCounters),
    expenseCategories: serializeRows(expenseCategories),
  };

  const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, "-");
  return {
    filename: `pos-backup-${restaurant.slug}-${stamp}.json`,
    payload,
  };
}
