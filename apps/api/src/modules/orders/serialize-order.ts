import type { OrderItemKitchenStatus, KitchenStation } from "@pos/database";
import { money, moneyMulInt, moneyZero } from "../../core/orders/money.js";
import type { OrderWithRelations } from "./orders.repository.js";
import { resolveOrderWaiterName } from "./order-waiter-name.js";

type OrderItemKitchenFields = {
  kitchenStatus?: OrderItemKitchenStatus;
  kitchenStation?: KitchenStation | null;
  kitchenSentAt?: Date | null;
  kitchenRevision?: number;
};

export function serializeOrderEntity(o: OrderWithRelations): unknown {
  return {
    id: o.id,
    restaurantId: o.restaurantId,
    orderNumber: o.orderNumber,
    ticketPublicCode: o.ticketPublicCode,
    ticketQrSchemaVersion: o.ticketQrSchemaVersion,
    type: o.type,
    status: o.status,
    paymentStatus: o.paymentStatus,
    partySize: o.partySize ?? null,
    table: o.table ? { id: o.table.id, number: o.table.number, status: o.table.status } : null,
    customer: o.customer,
    waiter: o.waiter,
    waiterName: resolveOrderWaiterName(o),
    createdBy: o.createdBy,
    kitchenNotes: o.kitchenNotes,
    customerNotes: o.customerNotes,
    subtotal: o.subtotal.toFixed(2),
    taxTotal: o.taxTotal.toFixed(2),
    discountTotal: o.discountTotal.toFixed(2),
    total: o.total.toFixed(2),
    paidTotal: o.paidTotal.toFixed(2),
    balanceDue: o.total.sub(o.paidTotal).toFixed(2),
    openedAt: o.openedAt,
    closedAt: o.closedAt,
    version: o.version,
    kitchenDispatchGeneration: (o as { kitchenDispatchGeneration?: number }).kitchenDispatchGeneration ?? 0,
    items: o.items.map((it) => {
      const kitchen = it as typeof it & OrderItemKitchenFields;
      const perUnitMods = it.modifiers.reduce((acc, m) => acc.add(m.priceDelta), moneyZero);
      const modifiersLineTotal = moneyMulInt(perUnitMods, it.quantity).toFixed(2);
      return {
        id: it.id,
        menuItemId: it.menuItemId,
        nameSnapshot: it.nameSnapshot,
        quantity: it.quantity,
        unitPrice: it.unitPrice.toFixed(2),
        lineSubtotal: it.lineSubtotal.toFixed(2),
        kitchenNotes: it.kitchenNotes,
        removedIngredients: it.removedIngredients,
        modifiers: it.modifiers.map((m) => ({
          id: m.id,
          modifierId: m.modifierId,
          label: m.label,
          priceDelta: m.priceDelta.toFixed(2),
        })),
        modifiersLineTotal,
        kitchenStatus: kitchen.kitchenStatus ?? "PENDING",
        kitchenStation: kitchen.kitchenStation ?? null,
        kitchenSentAt: kitchen.kitchenSentAt?.toISOString() ?? null,
        kitchenRevision: kitchen.kitchenRevision ?? 0,
      };
    }),
  };
}
