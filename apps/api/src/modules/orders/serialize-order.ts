import { money, moneyMulInt, moneyZero } from "../../core/orders/money.js";
import type { OrderWithRelations } from "./orders.repository.js";

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
    items: o.items.map((it) => {
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
      };
    }),
  };
}
