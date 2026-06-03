import type { PrismaClient } from "@prisma/client";

import type { RestaurantDataClearResult } from "./restaurant-backup.types.js";

/**
 * Deletes operational data while preserving users, roles, permissions, expense categories,
 * restaurant row, and system settings.
 */
export async function clearRestaurantOperationalData(
  prisma: PrismaClient,
  restaurantId: string,
): Promise<RestaurantDataClearResult> {
  const deleted: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    await tx.restaurantTable.updateMany({
      where: { restaurantId },
      data: { currentOrderId: null },
    });

    deleted.printJobs = (
      await tx.printJob.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.cashTransactions = (
      await tx.cashTransaction.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.refunds = (
      await tx.refund.deleteMany({ where: { order: { restaurantId } } })
    ).count;
    deleted.payments = (
      await tx.payment.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.orderLineMutationIdempotencies = (
      await tx.orderLineMutationIdempotency.deleteMany({ where: { restaurantId } })
    ).count;

    deleted.orderItemModifiers = (
      await tx.orderItemModifier.deleteMany({ where: { orderItem: { order: { restaurantId } } } })
    ).count;
    deleted.orderItems = (
      await tx.orderItem.deleteMany({ where: { order: { restaurantId } } })
    ).count;
    deleted.orders = (
      await tx.order.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.orderNumberCounters = (
      await tx.orderNumberCounter.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.tableReservations = (
      await tx.tableReservation.deleteMany({ where: { table: { restaurantId } } })
    ).count;
    deleted.tables = (
      await tx.restaurantTable.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.floors = (
      await tx.restaurantFloor.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.customers = (
      await tx.customer.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.menuItemModifiers = (
      await tx.menuItemModifier.deleteMany({ where: { menuItem: { restaurantId } } })
    ).count;
    deleted.modifiers = (
      await tx.modifier.deleteMany({ where: { menuItem: { restaurantId } } })
    ).count;
    deleted.ingredients = (
      await tx.ingredient.deleteMany({ where: { menuItem: { restaurantId } } })
    ).count;
    deleted.menuItems = (
      await tx.menuItem.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.menuCategories = (
      await tx.menuCategory.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.printers = (
      await tx.restaurantPrinter.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.expenses = (
      await tx.expense.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.shifts = (
      await tx.shift.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.syncMutations = (
      await tx.syncMutation.deleteMany({ where: { restaurantId } })
    ).count;
    deleted.dailySalesSnapshots = (
      await tx.dailySalesSnapshot.deleteMany({ where: { restaurantId } })
    ).count;
  });

  return { deleted };
}
