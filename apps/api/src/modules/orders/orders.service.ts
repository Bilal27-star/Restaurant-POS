import type { OrderStatus, OrderType } from "@prisma/client";

import { ApiError } from "../../core/http/ApiError.js";
import { money } from "../../core/orders/money.js";
import { prisma } from "../../prisma/index.js";
import { getRealtimeHub } from "../../realtime/registry.js";
import type { OrderLifecycleEventV1 } from "./orders.events.js";
import type { OrderWithRelations } from "./orders.repository.js";
import { OrdersRepository } from "./orders.repository.js";
import { buildCustomerReceiptDto, buildKitchenTicketDto, buildTableTicketDto } from "./printing/order-print-dtos.js";
import { serializeOrderEntity } from "./serialize-order.js";
import type { HardwarePrintOrchestrator } from "../printing/hardware-print-orchestrator.js";
import type { PaymentsService } from "../payments/payments.service.js";

const repoErrors: Record<string, { status: number; message: string }> = {
  ORDER_NOT_FOUND: { status: 404, message: "Order not found" },
  TABLE_NOT_FOUND: { status: 400, message: "Table not found or inactive" },
  TABLE_HAS_OPEN_ORDER: { status: 409, message: "Table already has an active order" },
  MENU_ITEM_INVALID: { status: 400, message: "Menu item unavailable or invalid" },
  MODIFIER_INVALID: { status: 400, message: "One or more modifiers are not valid for this item" },
  INGREDIENT_INVALID: { status: 400, message: "Removed ingredient not found on this item" },
  INGREDIENT_NOT_REMOVABLE: { status: 400, message: "Ingredient cannot be removed" },
  ORDER_CLOSED: { status: 409, message: "Order is already closed" },
  VERSION_CONFLICT: { status: 409, message: "Order was modified by another session (version mismatch)" },
  STATUS_INVALID: { status: 400, message: "Invalid order status transition" },
  CUSTOMER_INVALID: { status: 400, message: "Customer not found" },
  WAITER_INVALID: { status: 400, message: "Waiter not found in this restaurant" },
  ORDER_NOT_EDITABLE: { status: 409, message: "Order cannot be edited in its current state" },
  LINE_NOT_FOUND: { status: 404, message: "Order line not found" },
  ORDER_EMPTY: { status: 400, message: "Order must keep at least one line item" },
  ORDER_NOT_PAYABLE: { status: 409, message: "Payments cannot be applied to this order" },
  ORDER_CANCELLED: { status: 409, message: "Order is cancelled" },
  NOT_PAID: { status: 400, message: "Order must be fully paid before completion" },
  ORDER_NOT_CANCELLABLE: { status: 409, message: "Order cannot be cancelled" },
  HAS_PAYMENTS: { status: 409, message: "Cancel is blocked while payments exist; refund or void payments first" },
};

function patchTriggersKitchenTicket(patch: {
  kitchenNotes?: unknown;
  taxTotal?: unknown;
  discountTotal?: unknown;
  status?: unknown;
  partySize?: unknown;
}): boolean {
  return (
    patch.kitchenNotes !== undefined ||
    patch.taxTotal !== undefined ||
    patch.discountTotal !== undefined ||
    patch.status !== undefined ||
    patch.partySize !== undefined
  );
}

function mapRepoError(err: unknown): never {
  if (err instanceof Error) {
    const mapped = repoErrors[err.message];
    if (mapped) {
      if (mapped.status === 404) {
        throw ApiError.notFound(mapped.message);
      }
      if (mapped.status === 409) {
        throw ApiError.conflict(mapped.message);
      }
      throw ApiError.badRequest(mapped.message);
    }
  }
  throw err;
}

export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly payments: PaymentsService,
    private readonly hardwarePrint?: HardwarePrintOrchestrator | null,
  ) {}

  private wrap<T>(p: Promise<T>): Promise<T> {
    return p.catch((e) => mapRepoError(e));
  }

  async createOrder(input: {
    restaurantId: string;
    actorUserId: string;
    type: OrderType;
    tableId: string | null;
    customerId: string | null;
    waiterId: string | null;
    partySize: number | null;
    kitchenNotes: string | null;
    customerNotes: string | null;
    clientMutationId?: string | null;
    taxTotal?: string;
    discountTotal?: string;
    lines: {
      menuItemId: string;
      quantity: number;
      modifierIds: string[];
      removedIngredientIds: string[];
      kitchenNotes: string | null;
    }[];
  }): Promise<unknown> {
    const tax = input.taxTotal ? money(input.taxTotal) : money(0);
    const discount = input.discountTotal ? money(input.discountTotal) : money(0);
    if (discount.lt(money(0)) || tax.lt(money(0))) {
      throw ApiError.badRequest("Tax and discount must be non-negative");
    }

    if (input.customerId) {
      const c = await prisma.customer.findFirst({
        where: { id: input.customerId, restaurantId: input.restaurantId, deletedAt: null },
        select: { id: true },
      });
      if (!c) {
        throw ApiError.badRequest("Customer not found");
      }
    }
    const waiterId = input.waiterId ?? input.actorUserId;
    const w = await prisma.user.findFirst({
      where: { id: waiterId, restaurantId: input.restaurantId, deletedAt: null },
      select: { id: true },
    });
    if (!w) {
      throw ApiError.badRequest("Waiter not found in this restaurant");
    }

    return this.wrap(
      this.repo.createOrderWithLines({
        restaurantId: input.restaurantId,
        type: input.type,
        tableId: input.tableId,
        customerId: input.customerId,
        waiterId,
        createdByUserId: input.actorUserId,
        partySize: input.partySize,
        kitchenNotes: input.kitchenNotes,
        customerNotes: input.customerNotes,
        taxTotal: tax,
        discountTotal: discount,
        offlineClientMutationId: input.clientMutationId ?? null,
        lines: input.lines,
      }),
    ).then(({ order: o, inserted }) => {
      if (inserted) {
        this.hardwarePrint?.scheduleKitchenReprint(input.restaurantId, input.actorUserId, o);
        if (input.type === "DINE_IN" && input.tableId) {
          this.hardwarePrint?.scheduleTableTicket(input.restaurantId, input.actorUserId, o);
        }
        getRealtimeHub()?.publishOrderCreated(o);
      }
      return this.serializeOrder(o);
    });
  }

  getById(restaurantId: string, orderId: string): Promise<unknown> {
    return this.wrap(this.repo.getOrderByIdOrThrow(prisma, restaurantId, orderId)).then((o) =>
      this.serializeOrder(o),
    );
  }

  async listActive(
    restaurantId: string,
    q: { type?: OrderType; status?: OrderStatus; tableId?: string; limit: number; offset: number },
  ): Promise<unknown> {
    const rows = await this.repo.listActiveOrders(restaurantId, q);
    return rows.map((o) => this.serializeOrder(o));
  }

  async search(restaurantId: string, term: string, limit: number, offset: number): Promise<unknown> {
    const rows = await this.repo.searchOrders(restaurantId, term, limit, offset);
    return rows.map((o) => this.serializeOrder(o));
  }

  async history(
    restaurantId: string,
    q: {
      type?: "DINE_IN" | "TAKEAWAY";
      status?: "COMPLETED" | "CANCELLED";
      from?: Date;
      to?: Date;
      limit: number;
      offset: number;
    },
  ): Promise<unknown> {
    const rows = await this.repo.historyOrders(restaurantId, q);
    return rows.map((o) => this.serializeOrder(o));
  }

  patchOrder(input: {
    restaurantId: string;
    orderId: string;
    actorUserId: string;
    version?: number;
    patch: {
      kitchenNotes?: string | null;
      customerNotes?: string | null;
      status?: OrderStatus;
      customerId?: string | null;
      waiterId?: string | null;
      partySize?: number | null;
      taxTotal?: string | null;
      discountTotal?: string | null;
    };
  }): Promise<unknown> {
    const { taxTotal: taxIn, discountTotal: discIn, ...rest } = input.patch;
    const patch: {
      kitchenNotes?: string | null;
      customerNotes?: string | null;
      status?: OrderStatus;
      customerId?: string | null;
      waiterId?: string | null;
      partySize?: number | null;
      taxTotal?: import("@prisma/client").Prisma.Decimal | null;
      discountTotal?: import("@prisma/client").Prisma.Decimal | null;
    } = { ...rest };

    if (taxIn !== undefined) {
      const t = taxIn === null || taxIn === "" ? money(0) : money(taxIn);
      if (t.lt(money(0))) {
        throw ApiError.badRequest("Tax must be non-negative");
      }
      patch.taxTotal = t;
    }
    if (discIn !== undefined) {
      const d = discIn === null || discIn === "" ? money(0) : money(discIn);
      if (d.lt(money(0))) {
        throw ApiError.badRequest("Discount must be non-negative");
      }
      patch.discountTotal = d;
    }

    return this.wrap(
      this.repo.patchOrderMeta({
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        expectedVersion: input.version,
        patch,
      }),
    ).then((o) => {
      if (patchTriggersKitchenTicket(input.patch)) {
        this.hardwarePrint?.scheduleKitchenReprint(input.restaurantId, input.actorUserId, o);
      }
      getRealtimeHub()?.publishOrderUpdated(o, { op: "patch" });
      return this.serializeOrder(o);
    });
  }

  addLines(input: {
    restaurantId: string;
    orderId: string;
    actorUserId: string;
    version?: number;
    lines: {
      menuItemId: string;
      quantity: number;
      modifierIds: string[];
      removedIngredientIds: string[];
      kitchenNotes: string | null;
    }[];
  }): Promise<unknown> {
    return this.wrap(
      this.repo.addLines({
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        expectedVersion: input.version,
        lines: input.lines,
      }),
    ).then((o) => {
      this.hardwarePrint?.scheduleKitchenReprint(input.restaurantId, input.actorUserId, o);
      getRealtimeHub()?.publishOrderUpdated(o, { op: "add_lines" });
      return this.serializeOrder(o);
    });
  }

  updateLine(input: {
    restaurantId: string;
    orderId: string;
    lineId: string;
    actorUserId: string;
    version?: number;
    patch: {
      quantity?: number;
      modifierIds?: string[];
      removedIngredientIds?: string[];
      kitchenNotes?: string | null;
    };
  }): Promise<unknown> {
    return this.wrap(
      this.repo.updateLine({
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        lineId: input.lineId,
        expectedVersion: input.version,
        patch: input.patch,
      }),
    ).then((o) => {
      this.hardwarePrint?.scheduleKitchenReprint(input.restaurantId, input.actorUserId, o);
      getRealtimeHub()?.publishOrderUpdated(o, { op: "update_line" });
      return this.serializeOrder(o);
    });
  }

  deleteLine(input: {
    restaurantId: string;
    orderId: string;
    lineId: string;
    actorUserId: string;
    version?: number;
  }): Promise<unknown> {
    return this.wrap(
      this.repo.deleteLine({
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        lineId: input.lineId,
        expectedVersion: input.version,
      }),
    ).then((o) => {
      this.hardwarePrint?.scheduleKitchenReprint(input.restaurantId, input.actorUserId, o);
      getRealtimeHub()?.publishOrderUpdated(o, { op: "delete_line" });
      return this.serializeOrder(o);
    });
  }

  recordPayment(input: {
    restaurantId: string;
    orderId: string;
    version?: number;
    method: string;
    amount: string;
    amountReceived?: string | null;
    idempotencyKey?: string | null;
    recordedByUserId: string;
  }): Promise<unknown> {
    const amt = money(input.amount);
    if (amt.lte(money(0))) {
      throw ApiError.badRequest("Payment amount must be positive");
    }
    return this.payments
      .capture({
        restaurantId: input.restaurantId,
        actorUserId: input.recordedByUserId,
        orderId: input.orderId,
        method: input.method,
        amount: input.amount,
        amountReceived: input.amountReceived,
        orderVersion: input.version,
        idempotencyKey: input.idempotencyKey,
        autoCompleteOrder: false,
      })
      .then((res) => (res as { order: unknown }).order)
      .catch((e) => mapRepoError(e));
  }

  completeOrder(input: { restaurantId: string; orderId: string; version?: number }): Promise<unknown> {
    return this.wrap(
      this.repo.completeOrder({
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        expectedVersion: input.version,
      }),
    ).then((o) => {
      const event = this.toLifecycleEvent("COMPLETED", o);
      getRealtimeHub()?.publishOrderCompleted(o, { event });
      return { order: this.serializeOrder(o), analytics: { event } };
    });
  }

  cancelOrder(input: { restaurantId: string; orderId: string; version?: number }): Promise<unknown> {
    return this.wrap(
      this.repo.cancelOrder({
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        expectedVersion: input.version,
      }),
    ).then((o) => {
      const event = this.toLifecycleEvent("CANCELLED", o);
      getRealtimeHub()?.publishOrderCancelled(o, { event });
      return { order: this.serializeOrder(o), analytics: { event } };
    });
  }

  async printKitchen(restaurantId: string, orderId: string): Promise<unknown> {
    const o = await this.wrap(this.repo.getOrderByIdOrThrow(prisma, restaurantId, orderId));
    const name = await this.repo.findRestaurantName(restaurantId);
    return buildKitchenTicketDto({
      restaurantName: name,
      orderNumber: o.orderNumber,
      tableNumber: o.table?.number ?? null,
      orderType: o.type,
      status: o.status,
      kitchenNotes: o.kitchenNotes,
      items: o.items.map((it) => ({
        quantity: it.quantity,
        nameSnapshot: it.nameSnapshot,
        kitchenNotes: it.kitchenNotes,
        removedIngredients: it.removedIngredients,
        modifiers: it.modifiers.map((m) => ({ label: m.label, priceDelta: m.priceDelta })),
      })),
    });
  }

  async printTable(restaurantId: string, orderId: string): Promise<unknown> {
    const o = await this.wrap(this.repo.getOrderByIdOrThrow(prisma, restaurantId, orderId));
    const name = await this.repo.findRestaurantName(restaurantId);
    return buildTableTicketDto({
      restaurantName: name,
      orderNumber: o.orderNumber,
      ticketPublicCode: o.ticketPublicCode,
      tableNumber: o.table?.number ?? null,
      orderType: o.type,
    });
  }

  async printReceipt(restaurantId: string, orderId: string): Promise<unknown> {
    const o = await this.wrap(this.repo.getOrderByIdOrThrow(prisma, restaurantId, orderId));
    const name = await this.repo.findRestaurantName(restaurantId);
    return buildCustomerReceiptDto({
      restaurantName: name,
      orderNumber: o.orderNumber,
      subtotal: o.subtotal,
      taxTotal: o.taxTotal,
      discountTotal: o.discountTotal,
      total: o.total,
      paidTotal: o.paidTotal,
      paymentStatus: o.paymentStatus,
      items: o.items.map((it) => ({
        quantity: it.quantity,
        nameSnapshot: it.nameSnapshot,
        unitPrice: it.unitPrice,
        lineSubtotal: it.lineSubtotal,
      })),
    });
  }

  toLifecycleEvent(phase: OrderLifecycleEventV1["phase"], o: OrderWithRelations): OrderLifecycleEventV1 {
    return {
      v: 1,
      phase,
      restaurantId: o.restaurantId,
      orderId: o.id,
      orderNumber: o.orderNumber,
      occurredAt: new Date().toISOString(),
      totals: {
        subtotal: o.subtotal.toFixed(2),
        total: o.total.toFixed(2),
        paidTotal: o.paidTotal.toFixed(2),
        paymentStatus: o.paymentStatus,
      },
    };
  }

  serializeOrder(o: OrderWithRelations): unknown {
    return serializeOrderEntity(o);
  }
}
