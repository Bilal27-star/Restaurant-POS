import type { PrismaClient } from "@prisma/client";

import type { RestaurantBackupPayload, RestaurantBackupRestoreResult } from "./restaurant-backup.types.js";

type Row = Record<string, unknown>;

function rowId(row: Row): string {
  const id = row.id;
  if (typeof id !== "string" || !id) {
    throw new Error("Backup row is missing id");
  }
  return id;
}

async function upsertMany(
  label: string,
  rows: Row[],
  upsert: (row: Row) => Promise<unknown>,
  restored: Record<string, number>,
): Promise<void> {
  restored[label] = 0;
  for (const row of rows) {
    await upsert(row);
    restored[label] += 1;
  }
}

export async function restoreRestaurantBackup(
  prisma: PrismaClient,
  restaurantId: string,
  payload: RestaurantBackupPayload,
): Promise<RestaurantBackupRestoreResult> {
  if (payload.restaurantId !== restaurantId) {
    throw new Error("Backup restaurantId does not match current restaurant");
  }

  const restored: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
  if (payload.systemSettings) {
    const s = payload.systemSettings;
    await tx.systemSettings.upsert({
      where: { restaurantId },
      create: { ...(s as object), restaurantId } as never,
      update: {
        restaurantName: s.restaurantName as string,
        address: (s.address as string | null | undefined) ?? null,
        phone: (s.phone as string | null | undefined) ?? null,
        settingsJson: (s.settingsJson as object | undefined) ?? {},
      },
    });
    restored.systemSettings = 1;
  }

  await upsertMany("expenseCategories", payload.expenseCategories, async (row) => {
    await tx.expenseCategory.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("users", payload.users, async (row) => {
    await tx.user.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("userRoles", payload.userRoles, async (row) => {
    const userId = row.userId as string;
    const roleId = row.roleId as string;
    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  }, restored);

  await upsertMany("floors", payload.floors, async (row) => {
    await tx.restaurantFloor.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("tables", payload.tables, async (row) => {
    await tx.restaurantTable.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("tableReservations", payload.tableReservations, async (row) => {
    await tx.tableReservation.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("menuCategories", payload.menuCategories, async (row) => {
    await tx.menuCategory.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("menuItems", payload.menuItems, async (row) => {
    await tx.menuItem.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("ingredients", payload.ingredients, async (row) => {
    await tx.ingredient.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("modifiers", payload.modifiers, async (row) => {
    await tx.modifier.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("menuItemModifiers", payload.menuItemModifiers, async (row) => {
    await tx.menuItemModifier.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("customers", payload.customers, async (row) => {
    await tx.customer.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("printers", payload.printers, async (row) => {
    await tx.restaurantPrinter.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("shifts", payload.shifts, async (row) => {
    await tx.shift.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("orders", payload.orders, async (row) => {
    await tx.order.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("orderItems", payload.orderItems, async (row) => {
    await tx.orderItem.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("orderItemModifiers", payload.orderItemModifiers, async (row) => {
    await tx.orderItemModifier.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("payments", payload.payments, async (row) => {
    await tx.payment.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("refunds", payload.refunds, async (row) => {
    await tx.refund.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("expenses", payload.expenses, async (row) => {
    await tx.expense.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("cashTransactions", payload.cashTransactions, async (row) => {
    await tx.cashTransaction.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);

  await upsertMany("orderNumberCounters", payload.orderNumberCounters, async (row) => {
    await tx.orderNumberCounter.upsert({
      where: { id: rowId(row) },
      create: row as never,
      update: row as never,
    });
  }, restored);
  });

  return { restored };
}
