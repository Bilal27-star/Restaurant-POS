import { prisma } from "../../prisma/index.js";

/** Real-time counts for main nav badges (no hardcoded UI numbers). */
export class NavigationService {
  async counts(restaurantId: string) {
    const [occupiedTables, dineInOpenOrders, takeawayOpen] = await Promise.all([
      prisma.restaurantTable.count({
        where: {
          restaurantId,
          deletedAt: null,
          OR: [{ currentOrderId: { not: null } }, { status: { in: ["OCCUPIED", "PAYMENT_PENDING"] } }],
        },
      }),
      prisma.order.count({
        where: {
          restaurantId,
          closedAt: null,
          type: "DINE_IN",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
      prisma.order.count({
        where: {
          restaurantId,
          closedAt: null,
          type: "TAKEAWAY",
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
    ]);

    return {
      occupiedTables,
      dineInOpenOrders,
      takeawayOpen,
    };
  }
}
