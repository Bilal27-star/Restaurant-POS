import type { PaymentMethod, KitchenStation, Prisma } from "@pos/database";

type RestaurantPrinter = Prisma.RestaurantPrinterGetPayload<Record<string, never>>;

import { isOpenCashDrawerAfterPaymentEnabled } from "../../core/printing/cashier-receipt-settings.js";
import type { CustomerReceiptDocument, KitchenTicketDocument, TableTicketDocument } from "../../core/printing/documents/types.js";
import { prisma } from "../../prisma/index.js";
import { resolveKitchenStation } from "../menu/kitchen-station.js";
import type { OrderWithRelations } from "../orders/orders.repository.js";
import { buildKitchenTicketDto, buildTableTicketDto } from "../orders/printing/order-print-dtos.js";
import { resolveOrderWaiterName } from "../orders/order-waiter-name.js";
import { PrintingRepository } from "./printing.repository.js";
import { PrintingService } from "./printing.service.js";

function modifierLabel(m: { label: string; priceDelta: string }): string {
  if (!m.priceDelta || m.priceDelta === "0.00") return m.label;
  return `${m.label} (+${m.priceDelta})`;
}

function kitchenDtoToThermal(
  dto: ReturnType<typeof buildKitchenTicketDto> & { station: KitchenStation },
): KitchenTicketDocument {
  return {
    kind: "KITCHEN_TICKET",
    restaurantName: dto.restaurantName,
    orderNumber: dto.orderNumber,
    tableNumber: dto.tableNumber ?? null,
    orderType: dto.orderType,
    printedAtIso: new Date().toISOString(),
    orderKitchenNotes: dto.kitchenNotes ?? null,
    station: dto.station,
    lines: dto.lines.map((ln) => ({
      qty: ln.qty,
      name: ln.name,
      modifiers: ln.modifiers.map((m) => ({ label: modifierLabel(m) })),
      removedIngredients: ln.removedIngredients,
      kitchenNotes: ln.kitchenNotes ?? null,
    })),
  };
}

function paymentMethodLabel(m: PaymentMethod | string): string {
  switch (m) {
    case "CASH":
      return "Espèces";
    case "CARD":
      return "Carte";
    case "TRANSFER":
      return "Virement";
    default:
      return String(m);
  }
}

/**
 * Production print orchestration: maps orders/payments → thermal payloads and enqueues jobs.
 * Fire-and-forget from HTTP handlers; failures are logged and never block responses.
 */
export class HardwarePrintOrchestrator {
  constructor(
    readonly printing: PrintingService,
    private readonly printerRepo: PrintingRepository,
  ) {}

  /** Default cashier/receipt printer — never kitchen or station printers. */
  private async resolveTableTicketPrinter(restaurantId: string): Promise<RestaurantPrinter | null> {
    return prisma.restaurantPrinter.findFirst({
      where: {
        restaurantId,
        isDefault: true,
        isActive: true,
        kitchenStation: null,
        role: { not: "KITCHEN" },
      },
    });
  }

  /** Station kitchen printer: DB by `kitchenStation`, else hardcoded seed defaults. */
  private async resolveKitchenStationPrinter(
    restaurantId: string,
    station: KitchenStation,
  ): Promise<RestaurantPrinter> {
    return this.printing.resolveKitchenStationPrinter(restaurantId, station);
  }

  /** Queue a station-specific kitchen ticket when the order is still open for prep. */
  scheduleKitchenStationTicket(
    restaurantId: string,
    actorUserId: string | null,
    order: OrderWithRelations,
    station: KitchenStation,
    items: Array<{
      quantity: number;
      nameSnapshot: string;
      kitchenNotes?: string | null;
      removedIngredients: unknown;
      modifiers: Array<{ label: string; priceDelta: Prisma.Decimal }>;
    }>,
  ): void {
    void this.enqueueKitchenStationAsync(restaurantId, actorUserId, order, station, items).catch((err) => {
      console.error("[hardware-print] kitchen station enqueue failed", { restaurantId, orderId: order.id, station, err });
    });
  }

  private async enqueueKitchenStationAsync(
    restaurantId: string,
    actorUserId: string | null,
    order: OrderWithRelations,
    station: KitchenStation,
    items: Array<{
      quantity: number;
      nameSnapshot: string;
      kitchenNotes?: string | null;
      removedIngredients: unknown;
      modifiers: Array<{ label: string; priceDelta: Prisma.Decimal }>;
    }>,
  ): Promise<void> {
    if (order.status === "CANCELLED" || order.status === "COMPLETED") return;
    if (!items.length) return;

    let tableNumber = order.table?.number || null;
    if (!tableNumber && order.tableId) {
      const tbl = await prisma.restaurantTable.findUnique({
        where: { id: order.tableId },
        select: { number: true },
      });
      tableNumber = tbl?.number || null;
    }

    if (!station) {
      console.warn("[ORDER PRINT FAILED]", { restaurantId, orderId: order.id, reason: "missing_station" });
      return;
    }

    console.log("[ORDER PRINT START]", {
      restaurantId,
      orderId: order.id,
      station,
      itemCount: items.length,
      kind: "KITCHEN_TICKET",
    });

    const selectedPrinter = await this.resolveKitchenStationPrinter(restaurantId, station);

    const restaurantName = await this.printerRepo.findRestaurantDisplayName(restaurantId);
    const dto = buildKitchenTicketDto({
      restaurantName,
      orderNumber: order.orderNumber,
      tableNumber,
      orderType: order.type,
      status: order.status,
      kitchenNotes: order.kitchenNotes || null,
      items,
    });

    const payload = kitchenDtoToThermal({
      ...dto,
      station,
    });

    try {
      await this.printing.enqueueJob({
        restaurantId,
        requestedByUserId: actorUserId,
        kind: "KITCHEN_TICKET",
        payload,
        printerId: selectedPrinter.id,
        priority: 5,
      });
      console.log("[ORDER PRINT SUCCESS]", {
        restaurantId,
        orderId: order.id,
        station,
        printerName: selectedPrinter.name,
      });
    } catch (err) {
      console.error("[ORDER PRINT FAILED]", {
        restaurantId,
        orderId: order.id,
        station,
        err,
      });
    }
  }

  /** Queue a kitchen ticket when the order is still open for prep. */
  scheduleKitchenReprint(restaurantId: string, actorUserId: string | null, order: OrderWithRelations): void {
    void this.enqueueKitchenAsync(restaurantId, actorUserId, order).catch((err) => {
      console.error("[hardware-print] kitchen enqueue failed", { restaurantId, orderId: order.id, err });
    });
  }

  /** After a successful payment capture (non-idempotent replay), queue customer receipt. */
  scheduleReceiptAfterCapture(input: {
    restaurantId: string;
    actorUserId: string;
    order: OrderWithRelations;
    payment: { id: string; method: PaymentMethod | string; amount: string; changeGiven: string | null };
  }): void {
    void this.enqueueReceiptAsync(input).catch((err) => {
      console.error("[hardware-print] receipt enqueue failed", { restaurantId: input.restaurantId, err });
    });
  }

  /** Identification ticket for dine-in (table + order + QR) — printed to receipt station when order opens. */
  scheduleTableTicket(restaurantId: string, actorUserId: string | null, order: OrderWithRelations): void {
    void this.enqueueTableTicketAsync(restaurantId, actorUserId, order).catch((err) => {
      console.error("[hardware-print] table ticket enqueue failed", { restaurantId, orderId: order.id, err });
    });
  }

  private async enqueueKitchenAsync(
    restaurantId: string,
    actorUserId: string | null,
    order: OrderWithRelations,
  ): Promise<void> {
    if (order.status === "CANCELLED" || order.status === "COMPLETED") return;
    if (!order.items.length) return;

    const kitchenGroups = new Map<KitchenStation, Array<typeof order.items[number]>>();

    for (const it of order.items) {
      if (!it.menuItemId) continue;
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: it.menuItemId },
        select: {
          kitchenStation: true,
          name: true,
          category: { select: { name: true, kitchenStation: true } },
        },
      });
      if (!menuItem) continue;

      let station = menuItem.kitchenStation;
      if (!station) {
        station = resolveKitchenStation(
          menuItem.category?.name,
          menuItem.name,
          menuItem.category?.kitchenStation,
        );
        if (station) {
          console.warn("[STATION RESOLVED]", {
            menuItemId: it.menuItemId,
            name: menuItem.name,
            category: menuItem.category?.name ?? null,
            station,
            source: "hardware-print-orchestrator",
          });
        }
      }
      if (!station) continue;

      const existing = kitchenGroups.get(station) ?? [];
      existing.push(it);
      kitchenGroups.set(station, existing);
    }

    await Promise.allSettled(
      Array.from(kitchenGroups.entries()).map(async ([station, items]) => {
        if (!station) return;
        try {
          await this.enqueueKitchenStationAsync(
            restaurantId,
            actorUserId,
            order,
            station,
            items.map((it) => ({
              quantity: it.quantity,
              nameSnapshot: it.nameSnapshot,
              kitchenNotes: it.kitchenNotes,
              removedIngredients: it.removedIngredients,
              modifiers: it.modifiers.map((m) => ({ label: m.label, priceDelta: m.priceDelta })),
            })),
          );
        } catch (err) {
          // Retain existing logs if any errors occur
          console.error("[hardware-print] kitchen station enqueue failed", { restaurantId, station, orderId: order.id, err });
        }
      })
    );
  }

  private async enqueueReceiptAsync(input: {
    restaurantId: string;
    actorUserId: string;
    order: OrderWithRelations;
    payment: { id: string; method: PaymentMethod | string; amount: string; changeGiven: string | null };
  }): Promise<void> {
    const selectedPrinter = await this.printerRepo.findDefaultActivePrinterForReceipt(input.restaurantId);
    if (!selectedPrinter) return;

    const settings = await prisma.systemSettings.findUnique({
      where: { restaurantId: input.restaurantId },
      select: { restaurantName: true, address: true, phone: true, settingsJson: true },
    });
    const fallbackName = await this.printerRepo.findRestaurantDisplayName(input.restaurantId);
    const restaurantName = settings?.restaurantName?.trim() || fallbackName;

    const cashier = await prisma.user.findFirst({
      where: { id: input.actorUserId, restaurantId: input.restaurantId, deletedAt: null },
      select: { fullName: true },
    });

    const payRow = await prisma.payment.findUnique({
      where: { id: input.payment.id },
      select: { amountReceived: true, method: true },
    });
    const cashTendered =
      payRow?.method === "CASH" && payRow.amountReceived != null ? payRow.amountReceived.toFixed(2) : null;

    const doc: CustomerReceiptDocument = {
      kind: "CUSTOMER_RECEIPT",
      restaurantName,
      addressLine: settings?.address ?? null,
      phoneLine: settings?.phone ?? null,
      orderNumber: input.order.orderNumber,
      tableNumber: input.order.table?.number ?? null,
      printedAtIso: new Date().toISOString(),
      lines: input.order.items.map((it) => ({
        name: it.nameSnapshot,
        qty: it.quantity,
        unitPrice: it.unitPrice.toFixed(2),
        lineTotal: it.lineSubtotal.toFixed(2),
        modifiers: it.modifiers.map((m) => modifierLabel({ label: m.label, priceDelta: m.priceDelta.toFixed(2) })),
      })),
      subtotal: input.order.subtotal.toFixed(2),
      taxTotal: input.order.taxTotal.toFixed(2),
      discountTotal: input.order.discountTotal.toFixed(2),
      total: input.order.total.toFixed(2),
      paymentMethod: paymentMethodLabel(input.payment.method),
      amountPaid: input.payment.amount,
      changeGiven: input.payment.changeGiven,
      cashTendered,
      qrPayload: `pos:payment:${input.payment.id}`,
      cashierName: cashier?.fullName ?? null,
      openCashDrawerBeforeCut:
        isOpenCashDrawerAfterPaymentEnabled(settings?.settingsJson) && payRow?.method === "CASH",
    };

    await this.printing.enqueueJob({
      restaurantId: input.restaurantId,
      requestedByUserId: input.actorUserId,
      kind: "CUSTOMER_RECEIPT",
      payload: doc,
      printerId: selectedPrinter.id,
      priority: 10,
    });
  }

  private async enqueueTableTicketAsync(
    restaurantId: string,
    actorUserId: string | null,
    order: OrderWithRelations,
  ): Promise<void> {
    let tableNumber = order.table?.number || null;
    if (!tableNumber && order.tableId) {
      const tbl = await prisma.restaurantTable.findUnique({
        where: { id: order.tableId },
        select: { number: true },
      });
      tableNumber = tbl?.number || null;
    }

    if (order.type !== "DINE_IN" || !tableNumber) return;

    const selectedPrinter = await this.resolveTableTicketPrinter(restaurantId);
    if (!selectedPrinter) return;

    const settings = await prisma.systemSettings.findUnique({
      where: { restaurantId },
      select: { restaurantName: true },
    });
    const fallbackName = await this.printerRepo.findRestaurantDisplayName(restaurantId);
    const restaurantName = settings?.restaurantName?.trim() || fallbackName;

    const dto = buildTableTicketDto({
      restaurantName,
      orderNumber: order.orderNumber,
      ticketPublicCode: order.ticketPublicCode,
      tableNumber,
      orderType: order.type,
    });

    const waiterName = resolveOrderWaiterName(order) ?? "—";
    const doc: TableTicketDocument = {
      kind: "TABLE_TICKET",
      restaurantName: dto.restaurantName,
      tableNumber: dto.tableNumber ?? "?",
      orderNumber: dto.orderNumber,
      waiterName,
      printedAtIso: new Date().toISOString(),
      referenceCode: dto.ticketPublicCode,
      qrPayload: dto.ticketPublicCode
        ? `pos:table:${order.id}:${dto.ticketPublicCode}`
        : `pos:order:${order.id}`,
      footerNote: "Ticket table — présentation caisse",
    };

    console.log("[PRINTER RESOLVED]", {
      restaurantId,
      kind: doc.kind,
      printerId: selectedPrinter.id,
      printerName: selectedPrinter.name,
      connection: selectedPrinter.connectionJson,
    });

    await this.printing.enqueueJob({
      restaurantId,
      requestedByUserId: actorUserId,
      kind: "TABLE_TICKET",
      payload: doc,
      printerId: selectedPrinter.id,
      priority: 4,
    });
  }
}
