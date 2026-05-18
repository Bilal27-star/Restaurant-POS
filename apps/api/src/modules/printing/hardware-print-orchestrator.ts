import type { PaymentMethod, KitchenStation, Prisma, RestaurantPrinter } from "@pos/database";

import type { CustomerReceiptDocument, KitchenTicketDocument, TableTicketDocument } from "../../core/printing/documents/types.js";
import { prisma } from "../../prisma/index.js";
import type { OrderWithRelations } from "../orders/orders.repository.js";
import { buildKitchenTicketDto, buildTableTicketDto } from "../orders/printing/order-print-dtos.js";
import { PrintingRepository } from "./printing.repository.js";
import { PrintingService } from "./printing.service.js";

const KITCHEN_STATION_CONFIG: Record<
  KitchenStation,
  { name: string; host: string; port: number }
> = {
  PIZZA: { name: "Pizza Printer", host: "192.168.1.100", port: 9100 },
  PLATS: { name: "Plats Printer", host: "192.168.1.101", port: 9100 },
  SNACK: { name: "Snack Printer", host: "192.168.1.102", port: 9100 },
  CAFETERIA: { name: "Cafeteria Printer", host: "192.168.1.103", port: 9100 },
};

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
    private readonly printing: PrintingService,
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

  /** Station kitchen printer — always NETWORK_TCP with fixed host per station. */
  private async resolveKitchenStationPrinter(
    restaurantId: string,
    station: KitchenStation,
  ): Promise<RestaurantPrinter> {
    const cfg = KITCHEN_STATION_CONFIG[station];
    if (!cfg) {
      throw new Error(`Unknown kitchen station: ${station}`);
    }

    const connectionJson = { host: cfg.host, port: cfg.port };
    const printerData = {
      name: cfg.name,
      role: "KITCHEN" as const,
      kitchenStation: station,
      driver: "NETWORK_TCP" as const,
      connectionJson,
      isActive: true,
      isDefault: false,
    };

    const existingPrinter =
      (await prisma.restaurantPrinter.findFirst({
        where: { restaurantId, kitchenStation: station, isActive: true },
      })) ??
      (await prisma.restaurantPrinter.findFirst({
        where: { restaurantId, name: cfg.name, isActive: true },
      }));

    if (existingPrinter) {
      return prisma.restaurantPrinter.update({
        where: { id: existingPrinter.id },
        data: printerData,
      });
    }

    return prisma.restaurantPrinter.create({
      data: { restaurantId, ...printerData },
    });
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
      throw new Error("Missing kitchen station");
    }

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

    if (payload.kind === "KITCHEN_TICKET" && !payload.station) {
      throw new Error("Missing kitchen station");
    }

    console.log("PRINTER RESOLUTION", {
      kind: payload.kind,
      station: payload.station,
      printer: selectedPrinter.name,
      connection: selectedPrinter.connectionJson,
    });

    console.log("LOCKED PRINTER", selectedPrinter.name);

    console.log("PRINT EXECUTION", {
      printer: selectedPrinter.name,
    });

    await this.printing.enqueueJob({
      restaurantId,
      requestedByUserId: actorUserId,
      kind: "KITCHEN_TICKET",
      payload,
      printerId: selectedPrinter.id,
      priority: 5,
    });
  }

  /** Queue a kitchen ticket when the order is still open for prep. */
  scheduleKitchenReprint(restaurantId: string, actorUserId: string | null, order: OrderWithRelations): void {
    void this.enqueueKitchenAsync(restaurantId, actorUserId, order).catch((err) => {
      console.error("[hardware-print] kitchen enqueue failed", { restaurantId, orderId: order.id, err });
    });
  }

  /** After a successful payment capture (non-idempotent replay), queue customer receipt; cash opens drawer. */
  scheduleReceiptAfterCapture(input: {
    restaurantId: string;
    actorUserId: string;
    order: OrderWithRelations;
    payment: { id: string; method: PaymentMethod | string; amount: string; changeGiven: string | null };
    openCashDrawer: boolean;
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
        select: { kitchenStation: true },
      });

      if (!menuItem?.kitchenStation) continue;

      const existing = kitchenGroups.get(menuItem.kitchenStation) ?? [];
      existing.push(it);
      kitchenGroups.set(menuItem.kitchenStation, existing);
    }

    for (const [station, items] of kitchenGroups) {
      if (!station) {
        throw new Error("Missing kitchen station");
      }
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
    }
  }

  private async enqueueReceiptAsync(input: {
    restaurantId: string;
    actorUserId: string;
    order: OrderWithRelations;
    payment: { id: string; method: PaymentMethod | string; amount: string; changeGiven: string | null };
    openCashDrawer: boolean;
  }): Promise<void> {
    const selectedPrinter = await this.printerRepo.findDefaultActivePrinterForReceipt(input.restaurantId);
    if (!selectedPrinter) return;

    console.log("LOCKED PRINTER", selectedPrinter.name);

    const settings = await prisma.systemSettings.findUnique({
      where: { restaurantId: input.restaurantId },
      select: { restaurantName: true, address: true, phone: true },
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
      openCashDrawerBeforeCut: input.openCashDrawer,
    };

    console.log("PRINT EXECUTION", {
      printer: selectedPrinter.name,
    });

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

    const waiterName = order.waiter?.fullName?.trim() || "—";
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

    console.log("PRINTER RESOLUTION", {
      kind: doc.kind,
      station: undefined,
      printer: selectedPrinter.name,
      connection: selectedPrinter.connectionJson,
    });

    console.log("LOCKED PRINTER", selectedPrinter.name);

    console.log("PRINT EXECUTION", {
      printer: selectedPrinter.name,
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
