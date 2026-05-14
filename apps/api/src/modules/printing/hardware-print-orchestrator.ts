import type { PaymentMethod } from "@prisma/client";

import type { CustomerReceiptDocument, KitchenTicketDocument, TableTicketDocument } from "../../core/printing/documents/types.js";
import { prisma } from "../../prisma/index.js";
import type { OrderWithRelations } from "../orders/orders.repository.js";
import { buildKitchenTicketDto, buildTableTicketDto } from "../orders/printing/order-print-dtos.js";
import { PrintingRepository } from "./printing.repository.js";
import { PrintingService } from "./printing.service.js";

function modifierLabel(m: { label: string; priceDelta: string }): string {
  if (!m.priceDelta || m.priceDelta === "0.00") return m.label;
  return `${m.label} (+${m.priceDelta})`;
}

function kitchenDtoToThermal(dto: ReturnType<typeof buildKitchenTicketDto>): KitchenTicketDocument {
  return {
    kind: "KITCHEN_TICKET",
    restaurantName: dto.restaurantName,
    orderNumber: dto.orderNumber,
    tableNumber: dto.tableNumber ?? null,
    orderType: dto.orderType,
    printedAtIso: new Date().toISOString(),
    orderKitchenNotes: dto.kitchenNotes ?? null,
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

    const printer = await this.printerRepo.findDefaultActivePrinterByRole(restaurantId, "KITCHEN");
    if (!printer) return;

    const restaurantName = await this.printerRepo.findRestaurantDisplayName(restaurantId);
    const dto = buildKitchenTicketDto({
      restaurantName,
      orderNumber: order.orderNumber,
      tableNumber: order.table?.number ?? null,
      orderType: order.type,
      status: order.status,
      kitchenNotes: order.kitchenNotes || null,
      items: order.items.map((it) => ({
        quantity: it.quantity,
        nameSnapshot: it.nameSnapshot,
        kitchenNotes: it.kitchenNotes,
        removedIngredients: it.removedIngredients,
        modifiers: it.modifiers.map((m) => ({ label: m.label, priceDelta: m.priceDelta })),
      })),
    });

    const payload = kitchenDtoToThermal(dto);
    await this.printing.enqueueJob({
      restaurantId,
      requestedByUserId: actorUserId,
      kind: "KITCHEN_TICKET",
      payload,
      printerId: printer.id,
      priority: 5,
    });
  }

  private async enqueueReceiptAsync(input: {
    restaurantId: string;
    actorUserId: string;
    order: OrderWithRelations;
    payment: { id: string; method: PaymentMethod | string; amount: string; changeGiven: string | null };
    openCashDrawer: boolean;
  }): Promise<void> {
    const printer = await this.printerRepo.findDefaultActivePrinterForReceipt(input.restaurantId);
    if (!printer) return;

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

    await this.printing.enqueueJob({
      restaurantId: input.restaurantId,
      requestedByUserId: input.actorUserId,
      kind: "CUSTOMER_RECEIPT",
      payload: doc,
      printerId: printer.id,
      priority: 10,
    });
  }

  private async enqueueTableTicketAsync(
    restaurantId: string,
    actorUserId: string | null,
    order: OrderWithRelations,
  ): Promise<void> {
    if (order.type !== "DINE_IN" || !order.table?.number) return;

    const printer = await this.printerRepo.findDefaultActivePrinterForReceipt(restaurantId);
    if (!printer) return;

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
      tableNumber: order.table.number,
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

    await this.printing.enqueueJob({
      restaurantId,
      requestedByUserId: actorUserId,
      kind: "TABLE_TICKET",
      payload: doc,
      printerId: printer.id,
      priority: 4,
    });
  }
}
