import { randomInt } from "node:crypto";

import type { OrderStatus, OrderType, Prisma } from "@prisma/client";

import { money, moneyAdd, moneyMulInt, moneyZero } from "../../core/orders/money.js";
import { prisma } from "../../prisma/index.js";

/** Shared include for hydrated order payloads (payments, orders, receipts). */
export const orderDetailInclude = {
  table: { select: { id: true, number: true, status: true } },
  customer: { select: { id: true, name: true, phone: true } },
  waiter: { select: { id: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      modifiers: true,
      menuItem: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export type Tx = Prisma.TransactionClient;

function ticketCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[randomInt(chars.length)]!;
  }
  return out;
}

function sumModifierDeltas(rows: { priceDelta: Prisma.Decimal }[]): Prisma.Decimal {
  return rows.reduce((acc, r) => acc.add(r.priceDelta), moneyZero);
}

function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  const terminal: OrderStatus[] = ["COMPLETED", "CANCELLED"];
  if (terminal.includes(from)) return false;
  if (to === "CANCELLED") return true;
  const orderFlow: Record<OrderStatus, OrderStatus[]> = {
    PENDING: ["PREPARING", "READY", "COMPLETED", "CANCELLED"],
    PREPARING: ["PENDING", "READY", "COMPLETED", "CANCELLED"],
    READY: ["PREPARING", "PENDING", "COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };
  return orderFlow[from]?.includes(to) ?? false;
}

export class OrdersRepository {
  async findRestaurantName(restaurantId: string): Promise<string> {
    const r = await prisma.restaurant.findFirst({
      where: { id: restaurantId },
      select: { name: true },
    });
    return r?.name ?? "Restaurant";
  }

  async allocateOrderNumber(tx: Tx, restaurantId: string): Promise<string> {
    const year = new Date().getUTCFullYear();
    const counter = await tx.orderNumberCounter.upsert({
      where: { restaurantId_year: { restaurantId, year } },
      create: { restaurantId, year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const n = counter.lastNumber;
    return `${year}-${String(n).padStart(6, "0")}`;
  }

  async allocateUniqueTicketPublicCode(tx: Tx, restaurantId: string): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = ticketCode();
      const clash = await tx.order.findFirst({
        where: { restaurantId, ticketPublicCode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new Error("ticket_public_code allocation failed");
  }

  async getMenuItemForLine(
    tx: Tx | typeof prisma,
    menuItemId: string,
    restaurantId: string,
  ): Promise<{
    id: string;
    name: string;
    basePrice: Prisma.Decimal;
    modifiers: { id: string; name: string; extraPrice: Prisma.Decimal }[];
    ingredients: { id: string; name: string; removable: boolean }[];
  } | null> {
    return tx.menuItem.findFirst({
      where: {
        id: menuItemId,
        restaurantId,
        deletedAt: null,
        available: true,
      },
      select: {
        id: true,
        name: true,
        basePrice: true,
        modifiers: { select: { id: true, name: true, extraPrice: true } },
        ingredients: { select: { id: true, name: true, removable: true } },
      },
    });
  }

  async findCustomer(tx: Tx | typeof prisma, customerId: string, restaurantId: string) {
    return tx.customer.findFirst({
      where: { id: customerId, restaurantId, deletedAt: null },
      select: { id: true },
    });
  }

  async findUserInRestaurant(tx: Tx | typeof prisma, userId: string, restaurantId: string) {
    return tx.user.findFirst({
      where: { id: userId, restaurantId, deletedAt: null },
      select: { id: true },
    });
  }

  async getTableForDineIn(
    tx: Tx,
    tableId: string,
    restaurantId: string,
  ): Promise<{
    id: string;
    number: string;
    status: import("@prisma/client").TableStatus;
    currentOrderId: string | null;
    deletedAt: Date | null;
  } | null> {
    return tx.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      select: { id: true, number: true, status: true, currentOrderId: true, deletedAt: true },
    });
  }

  buildLinePricing(
    catalog: {
      basePrice: Prisma.Decimal;
      modifiers: { id: string; name: string; extraPrice: Prisma.Decimal }[];
      ingredients: { id: string; name: string; removable: boolean }[];
    },
    modifierIds: string[],
    removedIngredientIds: string[],
  ): {
    unitPrice: Prisma.Decimal;
    modifierRows: { modifierId: string; label: string; priceDelta: Prisma.Decimal }[];
    removedJson: Prisma.InputJsonValue;
  } {
    const modSet = new Map(catalog.modifiers.map((m) => [m.id, m]));
    const modifierRows: { modifierId: string; label: string; priceDelta: Prisma.Decimal }[] = [];
    for (const mid of modifierIds) {
      const m = modSet.get(mid);
      if (!m) {
        throw new Error("MODIFIER_INVALID");
      }
      modifierRows.push({
        modifierId: m.id,
        label: m.name,
        priceDelta: m.extraPrice,
      });
    }

    const ingById = new Map(catalog.ingredients.map((i) => [i.id, i]));
    const removedNames: string[] = [];
    for (const rid of removedIngredientIds) {
      const ing = ingById.get(rid);
      if (!ing) {
        throw new Error("INGREDIENT_INVALID");
      }
      if (!ing.removable) {
        throw new Error("INGREDIENT_NOT_REMOVABLE");
      }
      removedNames.push(ing.name);
    }

    return {
      unitPrice: catalog.basePrice,
      modifierRows,
      removedJson: removedNames,
    };
  }

  async recalculateOrderTotals(tx: Tx, orderId: string): Promise<void> {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      include: { modifiers: true },
    });
    let subtotal = moneyZero;
    for (const it of items) {
      const perUnitMods = it.modifiers.reduce((acc, m) => acc.add(m.priceDelta), moneyZero);
      const perUnit = moneyAdd(it.unitPrice, perUnitMods);
      const lineSubtotal = moneyMulInt(perUnit, it.quantity);
      if (!lineSubtotal.equals(it.lineSubtotal)) {
        await tx.orderItem.update({
          where: { id: it.id },
          data: { lineSubtotal },
        });
      }
      subtotal = subtotal.add(lineSubtotal);
    }
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { taxTotal: true, discountTotal: true },
    });
    if (!order) return;
    const total = subtotal.add(order.taxTotal).sub(order.discountTotal);
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotal,
        total,
        version: { increment: 1 },
      },
    });
  }

  async getOrderByIdOrThrow(tx: Tx | typeof prisma, restaurantId: string, orderId: string): Promise<OrderWithRelations> {
    const o = await tx.order.findFirst({
      where: { id: orderId, restaurantId },
      include: orderDetailInclude,
    });
    if (!o) {
      throw new Error("ORDER_NOT_FOUND");
    }
    return o;
  }

  async findOrderHead(tx: Tx | typeof prisma, restaurantId: string, orderId: string) {
    return tx.order.findFirst({
      where: { id: orderId, restaurantId },
      select: {
        id: true,
        version: true,
        status: true,
        closedAt: true,
        tableId: true,
        total: true,
        paidTotal: true,
        paymentStatus: true,
        taxTotal: true,
        discountTotal: true,
      },
    });
  }

  async createOrderWithLines(input: {
    restaurantId: string;
    type: OrderType;
    tableId: string | null;
    customerId: string | null;
    waiterId: string | null;
    createdByUserId: string | null;
    partySize: number | null;
    kitchenNotes: string | null;
    customerNotes: string | null;
    taxTotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    /** When set, replays return the same order row (offline sync idempotency). */
    offlineClientMutationId?: string | null;
    lines: {
      menuItemId: string;
      quantity: number;
      modifierIds: string[];
      removedIngredientIds: string[];
      kitchenNotes: string | null;
    }[];
  }): Promise<{ order: OrderWithRelations; inserted: boolean }> {
    return prisma.$transaction(async (tx) => {
      if (input.offlineClientMutationId) {
        const existing = await tx.order.findFirst({
          where: {
            restaurantId: input.restaurantId,
            offlineClientMutationId: input.offlineClientMutationId,
          },
          include: orderDetailInclude,
        });
        if (existing) {
          return { order: existing, inserted: false };
        }
      }

      const orderNumber = await this.allocateOrderNumber(tx, input.restaurantId);
      const ticketPublicCode = await this.allocateUniqueTicketPublicCode(tx, input.restaurantId);

      if (input.type === "DINE_IN" && input.tableId) {
        const table = await this.getTableForDineIn(tx, input.tableId, input.restaurantId);
        if (!table || table.deletedAt) {
          throw new Error("TABLE_NOT_FOUND");
        }
        if (table.currentOrderId) {
          const open = await tx.order.findFirst({
            where: {
              id: table.currentOrderId,
              restaurantId: input.restaurantId,
              closedAt: null,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
            select: { id: true },
          });
          if (open) {
            throw new Error("TABLE_HAS_OPEN_ORDER");
          }
          await tx.restaurantTable.update({
            where: { id: input.tableId },
            data: { currentOrderId: null },
          });
        }
      }

      const order = await tx.order.create({
        data: {
          restaurantId: input.restaurantId,
          orderNumber,
          ticketPublicCode,
          type: input.type,
          status: "PENDING",
          tableId: input.tableId,
          customerId: input.customerId,
          waiterId: input.waiterId,
          partySize: input.partySize,
          createdByUserId: input.createdByUserId,
          kitchenNotes: input.kitchenNotes ?? "",
          customerNotes: input.customerNotes ?? "",
          taxTotal: input.taxTotal,
          discountTotal: input.discountTotal,
          subtotal: moneyZero,
          total: moneyZero,
          paidTotal: moneyZero,
          paymentStatus: "UNPAID",
          offlineClientMutationId: input.offlineClientMutationId ?? null,
        },
      });

      let sortBase = 0;
      for (const line of input.lines) {
        const catalog = await this.getMenuItemForLine(tx, line.menuItemId, input.restaurantId);
        if (!catalog) {
          throw new Error("MENU_ITEM_INVALID");
        }
        const { unitPrice, modifierRows, removedJson } = this.buildLinePricing(
          catalog,
          line.modifierIds,
          line.removedIngredientIds,
        );
        const perUnitMods = sumModifierDeltas(modifierRows);
        const perUnit = moneyAdd(unitPrice, perUnitMods);
        const lineSubtotal = moneyMulInt(perUnit, line.quantity);

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: catalog.id,
            nameSnapshot: catalog.name,
            unitPrice,
            quantity: line.quantity,
            lineSubtotal,
            sortOrder: sortBase++,
            kitchenNotes: line.kitchenNotes,
            removedIngredients: removedJson,
            modifiers: { create: modifierRows },
          },
        });
      }

      await this.recalculateOrderTotals(tx, order.id);

      if (input.type === "DINE_IN" && input.tableId) {
        await tx.restaurantTable.update({
          where: { id: input.tableId },
          data: { status: "OCCUPIED", currentOrderId: order.id, version: { increment: 1 } },
        });
      }

      return { order: await this.getOrderByIdOrThrow(tx, input.restaurantId, order.id), inserted: true };
    });
  }

  async listActiveOrders(
    restaurantId: string,
    filter: { type?: OrderType; status?: OrderStatus; tableId?: string; limit: number; offset: number },
  ): Promise<OrderWithRelations[]> {
    return prisma.order.findMany({
      where: {
        restaurantId,
        closedAt: null,
        status: filter.status ?? { notIn: ["COMPLETED", "CANCELLED"] },
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.tableId ? { tableId: filter.tableId } : {}),
      },
      include: orderDetailInclude,
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      take: filter.limit,
      skip: filter.offset,
    });
  }

  async searchOrders(
    restaurantId: string,
    q: string,
    limit: number,
    offset: number,
  ): Promise<OrderWithRelations[]> {
    const term = q.trim();
    return prisma.order.findMany({
      where: {
        restaurantId,
        OR: [
          { orderNumber: { contains: term, mode: "insensitive" } },
          { ticketPublicCode: { contains: term, mode: "insensitive" } },
          { table: { number: { contains: term, mode: "insensitive" } } },
          { customer: { name: { contains: term, mode: "insensitive" } } },
        ],
      },
      include: orderDetailInclude,
      orderBy: [{ openedAt: "desc" }],
      take: limit,
      skip: offset,
    });
  }

  async historyOrders(
    restaurantId: string,
    filter: {
      type?: "DINE_IN" | "TAKEAWAY";
      status?: "COMPLETED" | "CANCELLED";
      from?: Date;
      to?: Date;
      limit: number;
      offset: number;
    },
  ): Promise<OrderWithRelations[]> {
    const statusFilter = filter.status
      ? { status: filter.status as OrderStatus }
      : { status: { in: ["COMPLETED", "CANCELLED"] as OrderStatus[] } };
    return prisma.order.findMany({
      where: {
        restaurantId,
        ...(filter.type ? { type: filter.type } : {}),
        closedAt: {
          not: null,
          ...(filter.from ? { gte: filter.from } : {}),
          ...(filter.to ? { lte: filter.to } : {}),
        },
        ...statusFilter,
      },
      include: orderDetailInclude,
      orderBy: [{ closedAt: "desc" }],
      take: filter.limit,
      skip: filter.offset,
    });
  }

  async patchOrderMeta(input: {
    restaurantId: string;
    orderId: string;
    expectedVersion: number | undefined;
    patch: {
      kitchenNotes?: string | null;
      customerNotes?: string | null;
      status?: OrderStatus;
      customerId?: string | null;
      waiterId?: string | null;
      partySize?: number | null;
      taxTotal?: Prisma.Decimal | null;
      discountTotal?: Prisma.Decimal | null;
    };
  }): Promise<OrderWithRelations> {
    return prisma.$transaction(async (tx) => {
      const head = await this.findOrderHead(tx, input.restaurantId, input.orderId);
      if (!head) {
        throw new Error("ORDER_NOT_FOUND");
      }
      if (head.closedAt) {
        throw new Error("ORDER_CLOSED");
      }
      if (input.expectedVersion !== undefined && head.version !== input.expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }
      if (input.patch.status && !canTransition(head.status, input.patch.status)) {
        throw new Error("STATUS_INVALID");
      }

      if (input.patch.customerId !== undefined && input.patch.customerId) {
        const c = await this.findCustomer(tx, input.patch.customerId, input.restaurantId);
        if (!c) {
          throw new Error("CUSTOMER_INVALID");
        }
      }
      if (input.patch.waiterId !== undefined && input.patch.waiterId) {
        const u = await this.findUserInRestaurant(tx, input.patch.waiterId, input.restaurantId);
        if (!u) {
          throw new Error("WAITER_INVALID");
        }
      }

      const needsRecalc =
        input.patch.taxTotal !== undefined ||
        input.patch.discountTotal !== undefined;

      await tx.order.update({
        where: { id: input.orderId },
        data: {
          ...(input.patch.kitchenNotes !== undefined ? { kitchenNotes: input.patch.kitchenNotes ?? "" } : {}),
          ...(input.patch.customerNotes !== undefined ? { customerNotes: input.patch.customerNotes ?? "" } : {}),
          ...(input.patch.status ? { status: input.patch.status } : {}),
          ...(input.patch.customerId !== undefined ? { customerId: input.patch.customerId } : {}),
          ...(input.patch.waiterId !== undefined ? { waiterId: input.patch.waiterId } : {}),
          ...(input.patch.partySize !== undefined ? { partySize: input.patch.partySize } : {}),
          ...(input.patch.taxTotal !== undefined && input.patch.taxTotal !== null ? { taxTotal: input.patch.taxTotal } : {}),
          ...(input.patch.discountTotal !== undefined && input.patch.discountTotal !== null
            ? { discountTotal: input.patch.discountTotal }
            : {}),
          ...(needsRecalc ? {} : { version: { increment: 1 } }),
        },
      });

      if (needsRecalc) {
        await this.recalculateOrderTotals(tx, input.orderId);
      }

      return this.getOrderByIdOrThrow(tx, input.restaurantId, input.orderId);
    });
  }

  async addLines(input: {
    restaurantId: string;
    orderId: string;
    expectedVersion: number | undefined;
    lines: {
      menuItemId: string;
      quantity: number;
      modifierIds: string[];
      removedIngredientIds: string[];
      kitchenNotes: string | null;
    }[];
  }): Promise<OrderWithRelations> {
    return prisma.$transaction(async (tx) => {
      const head = await this.findOrderHead(tx, input.restaurantId, input.orderId);
      if (!head) {
        throw new Error("ORDER_NOT_FOUND");
      }
      if (head.closedAt) {
        throw new Error("ORDER_CLOSED");
      }
      if (head.status === "CANCELLED" || head.status === "COMPLETED") {
        throw new Error("ORDER_NOT_EDITABLE");
      }
      if (input.expectedVersion !== undefined && head.version !== input.expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }

      const maxSort = await tx.orderItem.aggregate({
        where: { orderId: input.orderId },
        _max: { sortOrder: true },
      });
      let sortBase = (maxSort._max.sortOrder ?? -1) + 1;

      for (const line of input.lines) {
        const catalog = await this.getMenuItemForLine(tx, line.menuItemId, input.restaurantId);
        if (!catalog) {
          throw new Error("MENU_ITEM_INVALID");
        }
        const { unitPrice, modifierRows, removedJson } = this.buildLinePricing(
          catalog,
          line.modifierIds,
          line.removedIngredientIds,
        );
        const perUnitMods = sumModifierDeltas(modifierRows);
        const perUnit = moneyAdd(unitPrice, perUnitMods);
        const lineSubtotal = moneyMulInt(perUnit, line.quantity);

        await tx.orderItem.create({
          data: {
            orderId: input.orderId,
            menuItemId: catalog.id,
            nameSnapshot: catalog.name,
            unitPrice,
            quantity: line.quantity,
            lineSubtotal,
            sortOrder: sortBase++,
            kitchenNotes: line.kitchenNotes,
            removedIngredients: removedJson,
            modifiers: { create: modifierRows },
          },
        });
      }

      await this.recalculateOrderTotals(tx, input.orderId);
      return this.getOrderByIdOrThrow(tx, input.restaurantId, input.orderId);
    });
  }

  async updateLine(input: {
    restaurantId: string;
    orderId: string;
    lineId: string;
    expectedVersion: number | undefined;
    patch: {
      quantity?: number;
      modifierIds?: string[];
      removedIngredientIds?: string[];
      kitchenNotes?: string | null;
    };
  }): Promise<OrderWithRelations> {
    return prisma.$transaction(async (tx) => {
      const head = await this.findOrderHead(tx, input.restaurantId, input.orderId);
      if (!head) {
        throw new Error("ORDER_NOT_FOUND");
      }
      if (head.closedAt) {
        throw new Error("ORDER_CLOSED");
      }
      if (head.status === "CANCELLED" || head.status === "COMPLETED") {
        throw new Error("ORDER_NOT_EDITABLE");
      }
      if (input.expectedVersion !== undefined && head.version !== input.expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }

      const line = await tx.orderItem.findFirst({
        where: { id: input.lineId, orderId: input.orderId },
        include: { modifiers: true },
      });
      if (!line || !line.menuItemId) {
        throw new Error("LINE_NOT_FOUND");
      }

      const catalog = await this.getMenuItemForLine(tx, line.menuItemId, input.restaurantId);
      if (!catalog) {
        throw new Error("MENU_ITEM_INVALID");
      }

      const shouldRebuildMods =
        input.patch.modifierIds !== undefined || input.patch.removedIngredientIds !== undefined;

      let removedJson: Prisma.InputJsonValue | undefined;
      if (shouldRebuildMods) {
        const modifierIds =
          input.patch.modifierIds ??
          line.modifiers.map((m) => m.modifierId).filter((id): id is string => Boolean(id));
        const removedIngredientIds = input.patch.removedIngredientIds ?? [];
        const built = this.buildLinePricing(catalog, modifierIds, removedIngredientIds);
        removedJson = built.removedJson;
        await tx.orderItemModifier.deleteMany({ where: { orderItemId: line.id } });
        await tx.orderItemModifier.createMany({
          data: built.modifierRows.map((r) => ({
            orderItemId: line.id,
            modifierId: r.modifierId,
            label: r.label,
            priceDelta: r.priceDelta,
          })),
        });
      }

      await tx.orderItem.update({
        where: { id: line.id },
        data: {
          ...(input.patch.quantity !== undefined ? { quantity: input.patch.quantity } : {}),
          ...(input.patch.kitchenNotes !== undefined ? { kitchenNotes: input.patch.kitchenNotes } : {}),
          ...(removedJson !== undefined ? { removedIngredients: removedJson } : {}),
        },
      });

      const fresh = await tx.orderItem.findUniqueOrThrow({
        where: { id: line.id },
        include: { modifiers: true },
      });
      const perUnitMods = fresh.modifiers.reduce((acc, m) => acc.add(m.priceDelta), moneyZero);
      const perUnit = moneyAdd(fresh.unitPrice, perUnitMods);
      const lineSubtotal = moneyMulInt(perUnit, fresh.quantity);
      await tx.orderItem.update({
        where: { id: line.id },
        data: { lineSubtotal },
      });

      await this.recalculateOrderTotals(tx, input.orderId);
      return this.getOrderByIdOrThrow(tx, input.restaurantId, input.orderId);
    });
  }

  async deleteLine(input: { restaurantId: string; orderId: string; lineId: string; expectedVersion?: number }) {
    return prisma.$transaction(async (tx) => {
      const head = await this.findOrderHead(tx, input.restaurantId, input.orderId);
      if (!head) {
        throw new Error("ORDER_NOT_FOUND");
      }
      if (head.closedAt) {
        throw new Error("ORDER_CLOSED");
      }
      if (head.status === "CANCELLED" || head.status === "COMPLETED") {
        throw new Error("ORDER_NOT_EDITABLE");
      }
      if (input.expectedVersion !== undefined && head.version !== input.expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }

      const line = await tx.orderItem.findFirst({
        where: { id: input.lineId, orderId: input.orderId },
      });
      if (!line) {
        throw new Error("LINE_NOT_FOUND");
      }

      await tx.orderItem.delete({ where: { id: input.lineId } });

      const remaining = await tx.orderItem.count({ where: { orderId: input.orderId } });
      if (remaining === 0) {
        throw new Error("ORDER_EMPTY");
      }

      await this.recalculateOrderTotals(tx, input.orderId);
      return this.getOrderByIdOrThrow(tx, input.restaurantId, input.orderId);
    });
  }

  async completeOrder(input: { restaurantId: string; orderId: string; expectedVersion?: number }) {
    return prisma.$transaction(async (tx) => {
      const head = await tx.order.findFirst({
        where: { id: input.orderId, restaurantId: input.restaurantId },
        select: {
          id: true,
          version: true,
          status: true,
          closedAt: true,
          tableId: true,
          paymentStatus: true,
          paidTotal: true,
          total: true,
        },
      });
      if (!head) {
        throw new Error("ORDER_NOT_FOUND");
      }
      if (head.closedAt) {
        throw new Error("ORDER_CLOSED");
      }
      if (head.status === "CANCELLED") {
        throw new Error("ORDER_CANCELLED");
      }
      if (input.expectedVersion !== undefined && head.version !== input.expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }
      if (head.paymentStatus !== "PAID") {
        throw new Error("NOT_PAID");
      }

      await tx.order.update({
        where: { id: input.orderId },
        data: {
          status: "COMPLETED",
          closedAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (head.tableId) {
        const t = await tx.restaurantTable.findUnique({
          where: { id: head.tableId },
          select: { currentOrderId: true },
        });
        if (t?.currentOrderId === head.id) {
          await tx.restaurantTable.update({
            where: { id: head.tableId },
            data: { status: "FREE", currentOrderId: null, version: { increment: 1 } },
          });
        }
      }

      return this.getOrderByIdOrThrow(tx, input.restaurantId, input.orderId);
    });
  }

  async cancelOrder(input: { restaurantId: string; orderId: string; expectedVersion?: number }) {
    return prisma.$transaction(async (tx) => {
      const head = await tx.order.findFirst({
        where: { id: input.orderId, restaurantId: input.restaurantId },
        select: {
          id: true,
          version: true,
          status: true,
          closedAt: true,
          tableId: true,
          paidTotal: true,
        },
      });
      if (!head) {
        throw new Error("ORDER_NOT_FOUND");
      }
      if (head.closedAt) {
        throw new Error("ORDER_CLOSED");
      }
      if (head.status === "COMPLETED" || head.status === "CANCELLED") {
        throw new Error("ORDER_NOT_CANCELLABLE");
      }
      if (input.expectedVersion !== undefined && head.version !== input.expectedVersion) {
        throw new Error("VERSION_CONFLICT");
      }
      if (head.paidTotal.gt(moneyZero)) {
        throw new Error("HAS_PAYMENTS");
      }

      await tx.order.update({
        where: { id: input.orderId },
        data: {
          status: "CANCELLED",
          closedAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (head.tableId) {
        const t = await tx.restaurantTable.findUnique({
          where: { id: head.tableId },
          select: { currentOrderId: true },
        });
        if (t?.currentOrderId === head.id) {
          await tx.restaurantTable.update({
            where: { id: head.tableId },
            data: { status: "FREE", currentOrderId: null, version: { increment: 1 } },
          });
        }
      }

      return this.getOrderByIdOrThrow(tx, input.restaurantId, input.orderId);
    });
  }
}
