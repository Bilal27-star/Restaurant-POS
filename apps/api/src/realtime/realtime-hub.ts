import type { Server } from "socket.io";
import type { Logger } from "pino";

import { RealtimeEvents, type RealtimeEventName } from "./events.js";
import { assertRealtimePayload } from "./payload-guard.js";
import {
  adminMayJoin,
  analyticsMayJoin,
  shiftsMayJoin,
  staffMayJoin,
  tenantRoom,
  RealtimeRooms,
  type RealtimeRoomKey,
} from "./rooms.js";
import type { OrderWithRelations } from "../modules/orders/orders.repository.js";
import { serializeOrderEntity } from "../modules/orders/serialize-order.js";
import { prisma } from "../prisma/index.js";

export type OrderRealtimeMeta = {
  op: "create" | "patch" | "add_lines" | "update_line" | "delete_line" | "payment" | "unknown";
};

export class RealtimeHub {
  private readonly analyticsTickTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly analyticsTickPending = new Map<string, { reason: string; orderId?: string }>();

  constructor(
    private readonly io: Server,
    private readonly log: Logger,
  ) {}

  private emitEnvelope(
    restaurantId: string,
    roomKeys: readonly RealtimeRoomKey[],
    event: RealtimeEventName,
    payload: unknown,
  ): void {
    assertRealtimePayload(this.log, event, payload);
    for (const key of roomKeys) {
      const room = tenantRoom(restaurantId, key);
      const n = this.io.sockets.adapter.rooms.get(room)?.size ?? 0;
      this.io.to(room).emit(event, payload);
      this.log.trace({ event, room, subscribers: n }, "realtime emit");
    }
  }

  private tablePayloadFromOrder(order: OrderWithRelations) {
    if (!order.table) {
      return null;
    }
    return {
      v: 1 as const,
      restaurantId: order.restaurantId,
      orderId: order.id,
      table: {
        id: order.table.id,
        number: order.table.number,
        status: order.table.status,
      },
    };
  }

  publishOrderCreated(order: OrderWithRelations): void {
    const rid = order.restaurantId;
    const payload = {
      v: 1 as const,
      restaurantId: rid,
      order: serializeOrderEntity(order),
      meta: { op: "create" } satisfies OrderRealtimeMeta,
    };
    this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.ORDER_CREATED, payload);
    const table = this.tablePayloadFromOrder(order);
    if (table) {
      this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.TABLE_UPDATED, table);
    }
    this.emitAnalyticsTick(rid, { reason: "order:created", orderId: order.id });
  }

  publishOrderUpdated(order: OrderWithRelations, meta: OrderRealtimeMeta): void {
    const rid = order.restaurantId;
    const payload = {
      v: 1 as const,
      restaurantId: rid,
      order: serializeOrderEntity(order),
      meta,
    };
    this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.ORDER_UPDATED, payload);
    const table = this.tablePayloadFromOrder(order);
    if (table) {
      this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.TABLE_UPDATED, table);
    }
    this.emitAnalyticsTick(rid, { reason: "order:updated", orderId: order.id });
  }

  publishOrderCompleted(order: OrderWithRelations, analytics: unknown): void {
    const rid = order.restaurantId;
    const payload = {
      v: 1 as const,
      restaurantId: rid,
      order: serializeOrderEntity(order),
      analytics,
    };
    this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.ORDER_COMPLETED, payload);
    const table = this.tablePayloadFromOrder(order);
    if (table) {
      this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.TABLE_UPDATED, table);
    }
    this.emitAnalyticsTick(rid, { reason: "order:completed", orderId: order.id });
  }

  publishOrderCancelled(order: OrderWithRelations, analytics: unknown): void {
    const rid = order.restaurantId;
    const payload = {
      v: 1 as const,
      restaurantId: rid,
      order: serializeOrderEntity(order),
      analytics,
    };
    this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.ORDER_CANCELLED, payload);
    const table = this.tablePayloadFromOrder(order);
    if (table) {
      this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.TABLE_UPDATED, table);
    }
    this.emitAnalyticsTick(rid, { reason: "order:cancelled", orderId: order.id });
  }

  publishPaymentCaptured(input: {
    restaurantId: string;
    order: OrderWithRelations;
    payment: { id: string; method: string; amount: string; changeGiven: string | null; status: string };
    orderCompleted: boolean;
    analytics: unknown;
    shiftId: string | null;
    idempotentReplay: boolean;
  }): void {
    if (input.idempotentReplay) {
      return;
    }
    const rid = input.restaurantId;
    const payload = {
      v: 1 as const,
      restaurantId: rid,
      payment: input.payment,
      order: serializeOrderEntity(input.order),
      orderCompleted: input.orderCompleted,
      analytics: input.analytics,
    };
    this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.PAYMENT_CAPTURED, payload);
    const table = this.tablePayloadFromOrder(input.order);
    if (table) {
      this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.TABLE_UPDATED, table);
    }
    void this.publishShiftUpdatedById(rid, input.shiftId);
    if (input.orderCompleted) {
      this.publishOrderCompleted(input.order, input.analytics);
    } else {
      this.emitAnalyticsTick(rid, { reason: "payment:captured", orderId: input.order.id });
    }
  }

  publishPaymentRefunded(input: {
    restaurantId: string;
    order: OrderWithRelations;
    analytics: unknown;
    shiftId: string | null;
  }): void {
    const rid = input.restaurantId;
    const payload = {
      v: 1 as const,
      restaurantId: rid,
      order: serializeOrderEntity(input.order),
      analytics: input.analytics,
    };
    this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.PAYMENT_REFUNDED, payload);
    const table = this.tablePayloadFromOrder(input.order);
    if (table) {
      this.emitEnvelope(rid, [RealtimeRooms.STAFF], RealtimeEvents.TABLE_UPDATED, table);
    }
    void this.publishShiftUpdatedById(rid, input.shiftId);
    this.emitAnalyticsTick(rid, { reason: "payment:refunded", orderId: input.order.id });
  }

  emitAnalyticsTick(restaurantId: string, detail: { reason: string; orderId?: string }): void {
    this.analyticsTickPending.set(restaurantId, detail);
    const existing = this.analyticsTickTimers.get(restaurantId);
    if (existing) {
      clearTimeout(existing);
    }
    const t = setTimeout(() => {
      this.analyticsTickTimers.delete(restaurantId);
      const pending = this.analyticsTickPending.get(restaurantId);
      this.analyticsTickPending.delete(restaurantId);
      if (!pending) {
        return;
      }
      const payload = {
        v: 1 as const,
        restaurantId,
        at: new Date().toISOString(),
        ...pending,
      };
      this.emitEnvelope(restaurantId, [RealtimeRooms.ANALYTICS], RealtimeEvents.ANALYTICS_TICK, payload);
    }, 280);
    this.analyticsTickTimers.set(restaurantId, t);
  }

  async publishShiftUpdatedById(restaurantId: string, shiftId: string | null): Promise<void> {
    if (!shiftId) {
      return;
    }
    const row = await prisma.shift.findFirst({
      where: { id: shiftId, restaurantId },
      select: {
        id: true,
        status: true,
        openedAt: true,
        closedAt: true,
        grossSales: true,
        cashSalesTotal: true,
        cardSalesTotal: true,
        transferSalesTotal: true,
        refundsTotal: true,
        openingCashFloat: true,
      },
    });
    if (!row) {
      return;
    }
    const payload = {
      v: 1 as const,
      restaurantId,
      shift: {
        id: row.id,
        status: row.status,
        openedAt: row.openedAt,
        closedAt: row.closedAt,
        grossSales: row.grossSales.toFixed(2),
        cashSalesTotal: row.cashSalesTotal.toFixed(2),
        cardSalesTotal: row.cardSalesTotal.toFixed(2),
        transferSalesTotal: row.transferSalesTotal.toFixed(2),
        refundsTotal: row.refundsTotal.toFixed(2),
        openingCashFloat: row.openingCashFloat.toFixed(2),
      },
    };
    this.emitEnvelope(restaurantId, [RealtimeRooms.SHIFTS], RealtimeEvents.SHIFT_UPDATED, payload);
  }

  publishStaffDataChanged(
    restaurantId: string,
    input: { domains: ReadonlyArray<"tables" | "menu" | "settings" | "shifts"> },
  ): void {
    const payload = {
      v: 1 as const,
      restaurantId,
      kind: "data:changed" as const,
      domains: input.domains,
    };
    this.emitEnvelope(restaurantId, [RealtimeRooms.STAFF, RealtimeRooms.ADMIN], RealtimeEvents.ADMIN_BROADCAST, payload);
  }

  /** Placeholder for a future outbox / desktop sync queue (offline-first). */
  enqueueForLaterSync(_envelope: { kind: string; payload: unknown }): void {
    /* intentionally empty */
  }
}

export function joinRoomsForSocket(
  socket: import("socket.io").Socket,
  log: Logger,
  restaurantId: string,
  permissions: string[],
): void {
  const perms = new Set(permissions);
  const joined: string[] = [];
  if (staffMayJoin(perms)) {
    void socket.join(tenantRoom(restaurantId, RealtimeRooms.STAFF));
    joined.push(RealtimeRooms.STAFF);
  }
  if (analyticsMayJoin(perms)) {
    void socket.join(tenantRoom(restaurantId, RealtimeRooms.ANALYTICS));
    joined.push(RealtimeRooms.ANALYTICS);
  }
  if (shiftsMayJoin(perms)) {
    void socket.join(tenantRoom(restaurantId, RealtimeRooms.SHIFTS));
    joined.push(RealtimeRooms.SHIFTS);
  }
  if (adminMayJoin(perms)) {
    void socket.join(tenantRoom(restaurantId, RealtimeRooms.ADMIN));
    joined.push(RealtimeRooms.ADMIN);
  }
  log.info(
    { socketId: socket.id, userId: socket.data.realtime?.userId, restaurantId, rooms: joined },
    "realtime socket rooms joined",
  );
}
