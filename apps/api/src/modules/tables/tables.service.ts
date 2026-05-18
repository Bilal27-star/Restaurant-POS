import type { TableStatus } from "@prisma/client";

import { ApiError } from "../../core/http/ApiError.js";
import { getRealtimeHub } from "../../realtime/registry.js";
import { prisma } from "../../prisma/index.js";

import {
  decimalToMajorString,
  openedMinutesSince,
  type ActiveOrderDetailDto,
  type ActiveOrderSummaryDto,
  type TableDetailResponseDto,
  type TableListResponseDto,
  type TableListRowDto,
} from "./tables.dto.js";
import type { TableDetailPayload, TableWithFloorAndOrder } from "./tables.repository.js";
import { TablesRepository } from "./tables.repository.js";

function mapActiveOrderSummary(o: NonNullable<TableWithFloorAndOrder["currentOrder"]>): ActiveOrderSummaryDto {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    ticketPublicCode: o.ticketPublicCode,
    guestCount: o.partySize && o.partySize > 0 ? o.partySize : 1,
    itemsCount: o._count.items,
    totalAmount: decimalToMajorString(o.total),
    openedMinutesAgo: openedMinutesSince(o.openedAt),
    paymentStatus: o.paymentStatus,
    status: o.status,
  };
}

function mapTableListRow(t: TableWithFloorAndOrder): TableListRowDto {
  const active =
    t.currentOrder && !t.currentOrder.closedAt && t.currentOrder.status !== "COMPLETED" && t.currentOrder.status !== "CANCELLED"
      ? mapActiveOrderSummary(t.currentOrder)
      : null;
  return {
    id: t.id,
    restaurantId: t.restaurantId,
    floorId: t.floorId,
    zone: t.floor?.name ?? null,
    number: t.number,
    capacity: t.capacity,
    status: t.status,
    activeOrder: active,
  };
}

function mapTableDetail(t: TableDetailPayload): TableDetailResponseDto {
  const co = t.currentOrder;
  const open =
    co &&
    !co.closedAt &&
    co.status !== "COMPLETED" &&
    co.status !== "CANCELLED"
        ? ((): ActiveOrderDetailDto => ({
          id: co.id,
          orderNumber: co.orderNumber,
          ticketPublicCode: co.ticketPublicCode,
          partySize: co.partySize,
          status: co.status,
          paymentStatus: co.paymentStatus,
          subtotal: decimalToMajorString(co.subtotal),
          taxTotal: decimalToMajorString(co.taxTotal),
          discountTotal: decimalToMajorString(co.discountTotal),
          total: decimalToMajorString(co.total),
          paidTotal: decimalToMajorString(co.paidTotal),
          version: co.version,
          openedAt: co.openedAt.toISOString(),
          openedMinutesAgo: openedMinutesSince(co.openedAt),
          waiterName: co.waiter?.fullName ?? null,
          items: co.items.map((it) => ({
            id: it.id,
            menuItemId: it.menuItemId,
            nameSnapshot: it.nameSnapshot,
            quantity: it.quantity,
            unitPrice: decimalToMajorString(it.unitPrice),
            lineSubtotal: decimalToMajorString(it.lineSubtotal),
            modifiers: it.modifiers.map((m) => ({
              label: m.label,
              priceDelta: decimalToMajorString(m.priceDelta),
            })),
          })),
        }))()
      : null;

  return {
    id: t.id,
    restaurantId: t.restaurantId,
    floorId: t.floorId,
    zone: t.floor?.name ?? null,
    number: t.number,
    capacity: t.capacity,
    status: t.status,
    activeOrder: open,
  };
}

export class TablesService {
  constructor(private readonly repo: TablesRepository) {}

  async layout(restaurantId: string) {
    return this.repo.listFloorsWithTables(restaurantId);
  }

  async listTables(restaurantId: string): Promise<TableListResponseDto> {
    const rows = await this.repo.listTablesWithOrders(restaurantId);
    const tables: TableListRowDto[] = rows.map(mapTableListRow);
    return { tables };
  }

  async getTableById(restaurantId: string, tableId: string): Promise<TableDetailResponseDto> {
    const t = await this.repo.findTableDetail(restaurantId, tableId);
    if (!t) {
      throw ApiError.notFound("Table not found");
    }
    return mapTableDetail(t);
  }

  async createFloor(restaurantId: string, name: string, sortOrder: number) {
    const floor = await this.repo.createFloor(restaurantId, name.trim(), sortOrder);
    console.info("[ROOM CREATED]", { restaurantId, floorId: floor.id, name: floor.name });
    const layout = await this.repo.listFloorsWithTables(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["tables"] });
    return layout;
  }

  async updateFloor(restaurantId: string, floorId: string, patch: { name?: string; sortOrder?: number }) {
    const n = await this.repo.updateFloor(restaurantId, floorId, patch);
    if (n.count === 0) {
      throw ApiError.notFound("Floor not found");
    }
    const layout = await this.repo.listFloorsWithTables(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["tables"] });
    return layout;
  }

  async deleteFloor(restaurantId: string, floorId: string) {
    await this.repo.softDeleteFloor(restaurantId, floorId);
    const layout = await this.repo.listFloorsWithTables(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["tables"] });
    return layout;
  }

  async createTable(restaurantId: string, input: { floorId: string | null; number: string; capacity: number }) {
    try {
      const table = await this.repo.createTable({
        restaurantId,
        floorId: input.floorId,
        number: input.number.trim(),
        capacity: input.capacity,
      });
      console.info("[TABLE CREATED]", {
        restaurantId,
        tableId: table.id,
        floorId: input.floorId,
        number: input.number.trim(),
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("Unique constraint")) {
        throw ApiError.conflict("Table number already exists on this floor");
      }
      throw e;
    }
    const layout = await this.repo.listFloorsWithTables(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["tables"] });
    return layout;
  }

  async updateTable(
    restaurantId: string,
    tableId: string,
    patch: { number?: string; capacity?: number; floorId?: string | null; status?: TableStatus },
  ) {
    const t = await this.repo.findTable(restaurantId, tableId);
    if (!t) {
      throw ApiError.notFound("Table not found");
    }
    if (patch.status === "FREE" && t.currentOrderId) {
      const o = t.currentOrder;
      if (o && !o.closedAt && o.status !== "COMPLETED" && o.status !== "CANCELLED") {
        throw ApiError.conflict("Cannot set table free while an open order is linked");
      }
    }
    try {
      await this.repo.updateTable(restaurantId, tableId, {
        ...(patch.number !== undefined ? { number: patch.number.trim() } : {}),
        ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
        ...(patch.floorId !== undefined ? { floorId: patch.floorId } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("Unique constraint")) {
        throw ApiError.conflict("Table number already exists on this floor");
      }
      throw e;
    }
    const layout = await this.repo.listFloorsWithTables(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["tables"] });
    return layout;
  }

  async deleteTable(restaurantId: string, tableId: string) {
    const t = await this.repo.findTable(restaurantId, tableId);
    if (!t) {
      throw ApiError.notFound("Table not found");
    }

    const activeOrdersCount = await prisma.order.count({
      where: {
        tableId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        closedAt: null,
      },
    });

    console.log("TABLE DELETE", {
      tableId,
      activeOrdersCount
    });

    if (activeOrdersCount > 0) {
      throw ApiError.conflict("Cannot delete table with active orders");
    }

    const n = await this.repo.softDeleteTable(restaurantId, tableId);
    if (n.count === 0) {
      throw ApiError.notFound("Table not found");
    }
    const layout = await this.repo.listFloorsWithTables(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["tables"] });
    return layout;
  }
}
