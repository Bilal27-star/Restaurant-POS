import type { TakeawayCustomer } from "./takeaway-customer-types";
import type { TakeawayOfflineOrder } from "./takeaway-offline-order";
import { formatAlgeriaPhoneDisplay, phoneKey } from "./takeaway-phone-utils";

/** Dedupe by national mobile key for autocomplete seeding. */
export function customersFromOrders(orders: TakeawayOfflineOrder[]): TakeawayCustomer[] {
  const map = new Map<string, TakeawayCustomer>();
  for (const o of orders) {
    const key = phoneKey(o.customerPhone);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        id: `saved-${key}`,
        name: o.customerName,
        phone: formatAlgeriaPhoneDisplay(o.customerPhone),
        address: o.customerAddress,
        notes: o.customerDeliveryNotes,
      });
    }
  }
  return [...map.values()];
}
