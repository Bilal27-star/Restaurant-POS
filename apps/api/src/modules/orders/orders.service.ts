import type { KitchenPrintIntentStatus, KitchenStation, OrderStatus, OrderType, Prisma } from "@pos/database";
import { randomUUID } from "node:crypto";

import { ApiError } from "../../core/http/ApiError.js";
import { money } from "../../core/orders/money.js";
import { prisma } from "../../prisma/index.js";
import { getRealtimeHub } from "../../realtime/registry.js";
import { resolveKitchenStation } from "../menu/kitchen-station.js";
import type { OrderLifecycleEventV1 } from "./orders.events.js";
import type { OrderWithRelations } from "./orders.repository.js";
import { OrdersRepository } from "./orders.repository.js";
import { buildCustomerReceiptDto, buildKitchenTicketDto, buildTableTicketDto } from "./printing/order-print-dtos.js";
import { resolveOrderWaiterName } from "./order-waiter-name.js";
import { serializeOrderEntity } from "./serialize-order.js";
import type { HardwarePrintOrchestrator } from "../printing/hardware-print-orchestrator.js";
import type { PaymentsService } from "../payments/payments.service.js";
import {
  KitchenDeltaDispatchService,
  type KitchenDispatchResult,
} from "../kitchen-delta/kitchen-delta-dispatch.service.js";
import { KitchenDeltaRepository } from "../kitchen-delta/kitchen-delta.repository.js";
import { isKitchenDeltaPrintingEnabled } from "../kitchen-delta/kitchen-delta-settings.js";
import { buildKitchenRecoveryInfo } from "../kitchen-delta/kitchen-delta-diagnostics.js";
import {
  appendManualKitchenReprintAuditLog,
  listKitchenDispatchAuditLogs,
} from "../kitchen-delta/kitchen-dispatch-audit.js";
import { KitchenUnroutedLinesError } from "../kitchen-delta/kitchen-delta-detector.js";
import { kitchenDispatchRequiredButMissing } from "../kitchen-delta/kitchen-dispatch-enforcement.js";
import type { KitchenDetectLine } from "../kitchen-delta/kitchen-delta.types.js";

function isKitchenLineFieldPatch(patch: {
  quantity?: number;
  modifierIds?: string[];
  removedIngredientIds?: string[];
  kitchenNotes?: string | null;
}): boolean {
  return (
    patch.quantity !== undefined ||
    patch.kitchenNotes !== undefined ||
    patch.modifierIds !== undefined ||
    patch.removedIngredientIds !== undefined
  );
}

function lineEligibleForKitchenDelta(line: KitchenDetectLine | null): line is KitchenDetectLine {
  return line != null && line.kitchenStatus !== "PENDING";
}

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
  MUTATION_ID_CONFLICT: {
    status: 409,
    message: "clientMutationId was already used for a different order mutation",
  },
};

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

export type KitchenResponseMeta = {
  mutationApplied: boolean;
  kitchenDispatched: boolean;
  intentId: string | null;
  intentStatus: KitchenPrintIntentStatus | null;
  failedStations: KitchenStation[];
  enqueuedStations?: KitchenDispatchResult["enqueuedStations"];
  recovery?: import("../kitchen-delta/kitchen-delta-diagnostics.js").KitchenRecoveryInfo;
};

export class OrdersService {
  private readonly db = prisma;
  private readonly kitchenRepo = new KitchenDeltaRepository();
  private readonly kitchenDelta: KitchenDeltaDispatchService;

  constructor(
    private readonly repo: OrdersRepository,
    private readonly payments: PaymentsService,
    private readonly printing?: HardwarePrintOrchestrator | null,
  ) {
    this.kitchenDelta = new KitchenDeltaDispatchService(this.printing?.printing ?? null);
  }

  private wrap<T>(p: Promise<T>): Promise<T> {
    return p.catch((e) => mapRepoError(e));
  }

  /** Kitchen delta pipeline — real dispatch when flag on, shadow when flag off. */
  private async runKitchenDelta(
    input: Parameters<KitchenDeltaDispatchService["runPipeline"]>[0],
  ): Promise<KitchenDispatchResult> {
    try {
      const enabled = await isKitchenDeltaPrintingEnabled(input.restaurantId);
      if (enabled) {
        return await this.kitchenDelta.runPipeline(input);
      }
      const shadow = await this.kitchenDelta.runShadowPipeline(input);
      return {
        ...shadow,
        enqueuedStations: [],
        failedStations: [],
      };
    } catch (err) {
      if (err instanceof KitchenUnroutedLinesError) {
        throw ApiError.badRequest(err.message, {
          code: err.code,
          unroutedLines: err.unroutedLines,
        });
      }
      console.error("[KITCHEN_DELTA] pipeline failed", {
        orderId: input.order.id,
        kind: input.kind,
        err,
      });
      throw ApiError.conflict("Kitchen dispatch failed. The order was saved but tickets were not sent.");
    }
  }

  private async enforceKitchenDispatchWhenRequired(
    restaurantId: string,
    orderId: string,
    mutationApplied: boolean,
    mutationKey: string | null | undefined,
    result: KitchenDispatchResult | null,
  ): Promise<void> {
    if (!(await isKitchenDeltaPrintingEnabled(restaurantId))) {
      return;
    }
    const missing = await kitchenDispatchRequiredButMissing(
      this.kitchenRepo,
      restaurantId,
      orderId,
      mutationApplied,
      mutationKey,
      result,
    );
    if (!missing) {
      return;
    }
    const meta = await this.kitchenMeta(restaurantId, orderId, mutationApplied, result);
    throw ApiError.conflict(
      "Kitchen ticket was not sent. Check printer configuration and station routing, then retry.",
      { kitchen: meta },
    );
  }

  private async kitchenMeta(
    restaurantId: string,
    orderId: string,
    mutationApplied: boolean,
    result: KitchenDispatchResult | null,
  ): Promise<KitchenResponseMeta> {
    const base: KitchenResponseMeta = {
      mutationApplied,
      kitchenDispatched: result?.kitchenDispatched ?? false,
      intentId: result?.intentId ?? null,
      intentStatus: result?.intentStatus ?? null,
      failedStations: result?.failedStations ?? [],
      enqueuedStations: result?.enqueuedStations,
    };

    if (await isKitchenDeltaPrintingEnabled(restaurantId)) {
      base.recovery = await buildKitchenRecoveryInfo(restaurantId, orderId);
    }

    return base;
  }

  private async scheduleKitchenJobsForOrder(orderId: string): Promise<void> {
    if (!this.printing) return;

    try {
      const order = await this.db.order.findUnique({
        where: { id: orderId },
        include: {
          table: true,
          waiter: true,
          items: {
            include: {
              menuItem: { include: { category: true } },
              modifiers: true,
            },
          },
        },
      });

      if (!order || order.status === "CANCELLED" || order.status === "COMPLETED") return;

      const grouped = order.items.reduce<Partial<Record<KitchenStation, (typeof order.items)[number][]>>>(
        (acc, line) => {
          const menuItem = line.menuItem;
          if (!menuItem) return acc;

          let station = menuItem.kitchenStation;
          if (!station) {
            station = resolveKitchenStation(menuItem.category?.name, menuItem.name);
            if (station) {
              console.warn("[STATION RESOLVED]", {
                orderId,
                menuItemId: menuItem.id,
                name: menuItem.name,
                category: menuItem.category?.name ?? null,
                station,
                source: "orders.service",
              });
            }
          }
          if (!station) return acc;

          if (!acc[station]) acc[station] = [];
          acc[station]!.push(line);
          return acc;
        },
        {},
      );

      const restaurantId = order.restaurantId;
      const actorUserId = order.createdByUserId ?? order.waiterId ?? null;
      const tableNumber = order.table?.number ?? null;
      const restaurantName = await this.repo.findRestaurantName(restaurantId);
      const waiterName = resolveOrderWaiterName(order);

      for (const [station, lines] of Object.entries(grouped) as [KitchenStation, (typeof order.items)[number][]][]) {
        const mappedItems = lines.map((it) => ({
          quantity: it.quantity,
          nameSnapshot: it.nameSnapshot,
          kitchenNotes: it.kitchenNotes,
          removedIngredients: it.removedIngredients,
          modifiers: (it.modifiers ?? []).map((m) => ({ label: m.label, priceDelta: m.priceDelta })),
        }));

        const dto = buildKitchenTicketDto({
          restaurantName,
          orderNumber: order.orderNumber,
          tableNumber,
          orderType: order.type,
          status: order.status,
          kitchenNotes: order.kitchenNotes,
          items: mappedItems,
        });

        const payload = {
          kind: "KITCHEN_TICKET" as const,
          restaurantName: dto.restaurantName,
          orderNumber: dto.orderNumber,
          tableNumber: dto.tableNumber ?? null,
          orderType: dto.orderType,
          printedAtIso: new Date().toISOString(),
          orderKitchenNotes: dto.kitchenNotes ?? null,
          station,
          ...(waiterName ? { waiterName } : {}),
          lines: dto.lines,
        };

        await this.printing.printing.enqueueKitchenStationJob({
          restaurantId,
          requestedByUserId: actorUserId,
          station,
          payload,
          itemNames: mappedItems.map((it) => it.nameSnapshot),
          orderId,
        });
      }
    } catch (err) {
      console.error("[ORDER PRINT FAILED]", { orderId, err });
    }
  }

  async createOrder(input: {
    restaurantId: string;
    actorUserId: string;
    type: OrderType;
    tableId: string | null;
    customerId: string | null;
    waiterId: string | null;
    waiterName?: string | null;
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
        waiterName: input.waiterName?.trim() || null,
        createdByUserId: input.actorUserId,
        partySize: input.partySize,
        kitchenNotes: input.kitchenNotes,
        customerNotes: input.customerNotes,
        taxTotal: tax,
        discountTotal: discount,
        offlineClientMutationId: input.clientMutationId ?? null,
        lines: input.lines,
      }),
    ).then(async ({ order: o, inserted }) => {
      const mutationKey = input.clientMutationId?.trim();
      const deltaEnabled = await isKitchenDeltaPrintingEnabled(input.restaurantId);
      const deltaResult = mutationKey
        ? await this.runKitchenDelta({
            kind: "CREATE",
            restaurantId: input.restaurantId,
            order: o,
            clientMutationId: mutationKey,
            mutationApplied: inserted,
          })
        : null;

      if (inserted && !deltaEnabled) {
        void this.scheduleKitchenJobsForOrder(o.id);
      }

      if (inserted) {
        getRealtimeHub()?.publishOrderCreated(o);
      } else {
        getRealtimeHub()?.publishOrderUpdated(o, { op: "patch" });
      }
      await this.enforceKitchenDispatchWhenRequired(
        input.restaurantId,
        o.id,
        inserted,
        mutationKey,
        deltaResult,
      );
      return this.serializeOrder(o, await this.kitchenMeta(input.restaurantId, o.id, inserted, deltaResult));
    });
  }

  getById(restaurantId: string, orderId: string): Promise<unknown> {
    return this.wrap(this.repo.getOrderByIdOrThrow(prisma, restaurantId, orderId)).then(async (o) => {
      const base = this.serializeOrder(o);
      if (await isKitchenDeltaPrintingEnabled(restaurantId)) {
        return {
          ...(base as Record<string, unknown>),
          kitchen: {
            recovery: await buildKitchenRecoveryInfo(restaurantId, orderId),
          },
        };
      }
      return base;
    });
  }

  async getKitchenRecovery(restaurantId: string, orderId: string): Promise<unknown> {
    await this.wrap(this.repo.getOrderByIdOrThrow(prisma, restaurantId, orderId));
    const enabled = await isKitchenDeltaPrintingEnabled(restaurantId);
    if (!enabled) {
      return { enabled: false, recovery: null };
    }
    return {
      enabled: true,
      recovery: await buildKitchenRecoveryInfo(restaurantId, orderId),
    };
  }

  async getKitchenDispatchAudit(restaurantId: string, orderId: string): Promise<unknown> {
    await this.wrap(this.repo.getOrderByIdOrThrow(prisma, restaurantId, orderId));
    const rows = await listKitchenDispatchAuditLogs(restaurantId, orderId);
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      lineId: r.orderItemId,
      mutationType: r.mutationKind,
      dispatchStatus: r.status,
      dispatchTimestamp: r.dispatchedAt.toISOString(),
      intentId: r.intentId,
      printJobId: r.printJobId,
    }));
  }

  async dispatchPendingKitchen(input: {
    restaurantId: string;
    orderId: string;
    actorUserId: string;
    clientMutationId: string;
    version?: number;
  }): Promise<unknown> {
    if (!(await isKitchenDeltaPrintingEnabled(input.restaurantId))) {
      throw ApiError.badRequest("Kitchen delta printing is not enabled for this restaurant");
    }

    const o = await this.wrap(this.repo.getOrderByIdOrThrow(prisma, input.restaurantId, input.orderId));
    if (input.version !== undefined && o.version !== input.version) {
      throw ApiError.conflict("Order was modified by another session (version mismatch)");
    }
    if (o.closedAt || o.status === "CANCELLED" || o.status === "COMPLETED") {
      throw ApiError.conflict("Order is not open for kitchen dispatch");
    }

    const removedLines = await this.kitchenRepo.loadPendingRemovedDetectLines(
      prisma,
      input.restaurantId,
      input.orderId,
    );
    const hasModified = o.items.some(
      (it) => (it as { kitchenStatus?: string }).kitchenStatus === "MODIFIED",
    );
    if (!hasModified && removedLines.length === 0) {
      throw ApiError.badRequest("No pending kitchen changes to dispatch");
    }

    const deltaResult = await this.runKitchenDelta({
      kind: "DISPATCH_PENDING",
      restaurantId: input.restaurantId,
      order: o,
      clientMutationId: input.clientMutationId.trim(),
      mutationApplied: true,
      removedLines,
    });

    if (deltaResult.intentId && removedLines.length > 0) {
      await prisma.$transaction(async (tx) => {
        await this.kitchenRepo.linkRemovedAuditsToIntent(
          tx,
          input.restaurantId,
          input.orderId,
          removedLines.map((line) => line.id),
          deltaResult.intentId!,
        );
      });
    }

    const fresh = await this.wrap(
      this.repo.getOrderByIdOrThrow(prisma, input.restaurantId, input.orderId),
    );
    await this.enforceKitchenDispatchWhenRequired(
      input.restaurantId,
      fresh.id,
      true,
      input.clientMutationId,
      deltaResult,
    );
    getRealtimeHub()?.publishOrderUpdated(fresh, { op: "patch" });
    return this.serializeOrder(
      fresh,
      await this.kitchenMeta(input.restaurantId, fresh.id, true, deltaResult),
    );
  }

  async fullKitchenReprint(input: {
    restaurantId: string;
    orderId: string;
    actorUserId: string;
    clientMutationId: string;
    lineIds?: string[];
  }): Promise<unknown> {
    if (!(await isKitchenDeltaPrintingEnabled(input.restaurantId))) {
      throw ApiError.badRequest("Kitchen delta printing is not enabled for this restaurant");
    }

    const order = await this.wrap(
      this.repo.getOrderByIdOrThrow(prisma, input.restaurantId, input.orderId),
    );
    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      throw ApiError.conflict("Cannot full-reprint kitchen tickets for a closed order");
    }

    const mutationKey = input.clientMutationId.trim();
    const deltaResult = await this.kitchenDelta.runFullReprintPipeline({
      restaurantId: input.restaurantId,
      order,
      clientMutationId: mutationKey,
      lineIds: input.lineIds,
    });

    await this.enforceKitchenDispatchWhenRequired(
      input.restaurantId,
      order.id,
      true,
      mutationKey,
      deltaResult,
    );

    if (deltaResult.intentId) {
      await appendManualKitchenReprintAuditLog({
        restaurantId: input.restaurantId,
        orderId: order.id,
        intentId: deltaResult.intentId,
      });
    }

    const fresh = await this.wrap(
      this.repo.getOrderByIdOrThrow(prisma, input.restaurantId, order.id),
    );

    return this.serializeOrder(
      fresh,
      await this.kitchenMeta(input.restaurantId, fresh.id, true, deltaResult),
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
      waiterName?: string | null;
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
      waiterName?: string | null;
      partySize?: number | null;
      taxTotal?: Prisma.Decimal | null;
      discountTotal?: Prisma.Decimal | null;
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
    ).then(async (o) => {
      getRealtimeHub()?.publishOrderUpdated(o, { op: "patch" });
      return this.serializeOrder(o);
    });
  }

  addLines(input: {
    restaurantId: string;
    orderId: string;
    actorUserId: string;
    version?: number;
    clientMutationId?: string | null;
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
        clientMutationId: input.clientMutationId ?? null,
        lines: input.lines,
      }),
    ).then(async ({ order: o, applied, addedLineIds }) => {
      const mutationKey = input.clientMutationId?.trim();
      const deltaEnabled = await isKitchenDeltaPrintingEnabled(input.restaurantId);
      const deltaResult = mutationKey
        ? await this.runKitchenDelta({
            kind: "LINE_ADD",
            restaurantId: input.restaurantId,
            order: o,
            clientMutationId: mutationKey,
            mutationApplied: applied,
            addedLineIds: addedLineIds ?? [],
          })
        : null;

      if (applied && !deltaEnabled) {
        void this.scheduleKitchenJobsForOrder(o.id);
      }
      await this.enforceKitchenDispatchWhenRequired(
        input.restaurantId,
        o.id,
        applied,
        mutationKey,
        deltaResult,
      );
      getRealtimeHub()?.publishOrderUpdated(o, { op: "add_lines" });
      return this.serializeOrder(o, await this.kitchenMeta(input.restaurantId, o.id, applied, deltaResult));
    });
  }

  async updateLine(input: {
    restaurantId: string;
    orderId: string;
    lineId: string;
    actorUserId: string;
    version?: number;
    clientMutationId?: string | null;
    patch: {
      quantity?: number;
      modifierIds?: string[];
      removedIngredientIds?: string[];
      kitchenNotes?: string | null;
    };
  }): Promise<unknown> {
    const deltaEnabled = await isKitchenDeltaPrintingEnabled(input.restaurantId);
    const kitchenPatch = isKitchenLineFieldPatch(input.patch);
    const clientKey = input.clientMutationId?.trim() || null;
    let beforeLine: KitchenDetectLine | null = null;
    if (kitchenPatch && deltaEnabled) {
      beforeLine = await this.kitchenRepo.loadKitchenDetectLine(
        prisma,
        input.restaurantId,
        input.orderId,
        input.lineId,
      );
    }
    const mutationKey =
      clientKey ??
      (kitchenPatch && deltaEnabled && lineEligibleForKitchenDelta(beforeLine) ? randomUUID() : null);

    return this.wrap(
      this.repo.updateLine({
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        lineId: input.lineId,
        expectedVersion: input.version,
        clientMutationId: clientKey,
        patch: input.patch,
      }),
    ).then(async ({ order: o, applied }) => {
      const deltaResult =
        mutationKey && beforeLine && lineEligibleForKitchenDelta(beforeLine)
          ? await this.runKitchenDelta({
              kind: "LINE_UPDATE",
              restaurantId: input.restaurantId,
              order: o,
              clientMutationId: mutationKey,
              mutationApplied: applied,
              lineId: input.lineId,
              beforeLine,
            })
          : null;

      if (applied && !deltaEnabled) {
        void this.scheduleKitchenJobsForOrder(o.id);
      }
      await this.enforceKitchenDispatchWhenRequired(
        input.restaurantId,
        o.id,
        applied,
        mutationKey,
        deltaResult,
      );
      getRealtimeHub()?.publishOrderUpdated(o, { op: "update_line" });
      return this.serializeOrder(o, await this.kitchenMeta(input.restaurantId, o.id, applied, deltaResult));
    });
  }

  async deleteLine(input: {
    restaurantId: string;
    orderId: string;
    lineId: string;
    actorUserId: string;
    version?: number;
    clientMutationId?: string | null;
  }): Promise<unknown> {
    const deltaEnabled = await isKitchenDeltaPrintingEnabled(input.restaurantId);
    const clientKey = input.clientMutationId?.trim() || null;
    let deletedLine: KitchenDetectLine | null = null;
    if (deltaEnabled) {
      deletedLine = await this.kitchenRepo.loadKitchenDetectLine(
        prisma,
        input.restaurantId,
        input.orderId,
        input.lineId,
      );
    }
    const mutationKey =
      clientKey ??
      (deltaEnabled && lineEligibleForKitchenDelta(deletedLine) ? randomUUID() : null);

    return this.wrap(
      this.repo.deleteLine({
        restaurantId: input.restaurantId,
        orderId: input.orderId,
        lineId: input.lineId,
        expectedVersion: input.version,
        clientMutationId: clientKey,
      }),
    ).then(async ({ order: o, applied }) => {
      const deltaResult =
        mutationKey && deletedLine && lineEligibleForKitchenDelta(deletedLine)
          ? await this.runKitchenDelta({
              kind: "LINE_DELETE",
              restaurantId: input.restaurantId,
              order: o,
              clientMutationId: mutationKey,
              mutationApplied: applied,
              deletedLine,
            })
          : null;

      if (applied && !deltaEnabled) {
        void this.scheduleKitchenJobsForOrder(o.id);
      }
      await this.enforceKitchenDispatchWhenRequired(
        input.restaurantId,
        o.id,
        applied,
        mutationKey,
        deltaResult,
      );
      getRealtimeHub()?.publishOrderUpdated(o, { op: "delete_line" });
      return this.serializeOrder(o, await this.kitchenMeta(input.restaurantId, o.id, applied, deltaResult));
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

  serializeOrder(o: OrderWithRelations, kitchen?: KitchenResponseMeta): unknown {
    const base = serializeOrderEntity(o);
    if (!kitchen) {
      return base;
    }
    return { ...(base as Record<string, unknown>), kitchen };
  }
}
