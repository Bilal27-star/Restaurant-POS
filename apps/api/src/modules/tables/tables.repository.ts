import type { Prisma, TableStatus } from "@prisma/client";

import { prisma } from "../../prisma/index.js";

const orderSummarySelect = {
  id: true,
  orderNumber: true,
  ticketPublicCode: true,
  partySize: true,
  paymentStatus: true,
  status: true,
  subtotal: true,
  total: true,
  paidTotal: true,
  openedAt: true,
  closedAt: true,
  waiter: { select: { fullName: true } },
  _count: { select: { items: true } },
  items: {
    orderBy: { sortOrder: "asc" as const },
    take: 24,
    select: {
      quantity: true,
      nameSnapshot: true,
      lineSubtotal: true,
    },
  },
} satisfies Prisma.OrderSelect;

const floorInclude = {
  tables: {
    where: { deletedAt: null },
    orderBy: { number: "asc" as const },
    include: {
      currentOrder: {
        select: orderSummarySelect,
      },
    },
  },
} satisfies Prisma.RestaurantFloorInclude;

export type FloorWithTables = Prisma.RestaurantFloorGetPayload<{ include: typeof floorInclude }>;

export type TableWithFloorAndOrder = Prisma.RestaurantTableGetPayload<{
  include: {
    floor: { select: { id: true; name: true } };
    currentOrder: { select: typeof orderSummarySelect };
  };
}>;

export type TableDetailPayload = Prisma.RestaurantTableGetPayload<{
  include: {
    floor: { select: { id: true; name: true } };
    currentOrder: {
      include: {
        items: {
          orderBy: { sortOrder: "asc" };
          select: {
            id: true;
            menuItemId: true;
            nameSnapshot: true;
            quantity: true;
            unitPrice: true;
            lineSubtotal: true;
            modifiers: { select: { label: true; priceDelta: true } };
          };
        };
        waiter: { select: { fullName: true } };
      };
    };
  };
}>;

export class TablesRepository {
  listFloorsWithTables(restaurantId: string): Promise<FloorWithTables[]> {
    return prisma.restaurantFloor.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: floorInclude,
    });
  }

  listTablesWithOrders(restaurantId: string): Promise<TableWithFloorAndOrder[]> {
    return prisma.restaurantTable.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: [{ floor: { sortOrder: "asc" } }, { number: "asc" }],
      include: {
        floor: { select: { id: true, name: true } },
        currentOrder: {
          select: orderSummarySelect,
        },
      },
    });
  }

  findTableDetail(restaurantId: string, tableId: string): Promise<TableDetailPayload | null> {
    return prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId, deletedAt: null },
      include: {
        floor: { select: { id: true, name: true } },
        currentOrder: {
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                menuItemId: true,
                nameSnapshot: true,
                quantity: true,
                unitPrice: true,
                lineSubtotal: true,
                modifiers: { select: { label: true, priceDelta: true } },
              },
            },
            waiter: { select: { fullName: true } },
          },
        },
      },
    });
  }

  async createFloor(restaurantId: string, name: string, sortOrder: number) {
    return prisma.restaurantFloor.create({
      data: { restaurantId, name, sortOrder },
    });
  }

  async updateFloor(restaurantId: string, floorId: string, data: { name?: string; sortOrder?: number }) {
    return prisma.restaurantFloor.updateMany({
      where: { id: floorId, restaurantId, deletedAt: null },
      data,
    });
  }

  async softDeleteFloor(restaurantId: string, floorId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.restaurantTable.updateMany({
        where: { restaurantId, floorId },
        data: { deletedAt: new Date() },
      });
      await tx.restaurantFloor.updateMany({
        where: { id: floorId, restaurantId },
        data: { deletedAt: new Date() },
      });
    });
  }

  async createTable(input: {
    restaurantId: string;
    floorId: string | null;
    number: string;
    capacity: number;
  }) {
    return prisma.restaurantTable.create({
      data: {
        restaurantId: input.restaurantId,
        floorId: input.floorId,
        number: input.number,
        capacity: input.capacity,
        status: "FREE",
      },
    });
  }

  async findTable(restaurantId: string, tableId: string) {
    return prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId, deletedAt: null },
      include: { currentOrder: { select: { id: true, closedAt: true, status: true } } },
    });
  }

  async updateTable(
    restaurantId: string,
    tableId: string,
    data: {
      number?: string;
      capacity?: number;
      floorId?: string | null;
      status?: TableStatus;
    },
  ) {
    return prisma.restaurantTable.update({
      where: { id: tableId },
      data: {
        ...(data.number !== undefined ? { number: data.number } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.floorId !== undefined ? { floorId: data.floorId } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        version: { increment: 1 },
      },
    });
  }

  async softDeleteTable(restaurantId: string, tableId: string) {
    return prisma.restaurantTable.updateMany({
      where: { id: tableId, restaurantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
