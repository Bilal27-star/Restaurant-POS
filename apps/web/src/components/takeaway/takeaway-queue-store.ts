import { create } from "zustand";
import type { TakeawayCustomer } from "./takeaway-customer-types";
import { createInitialTakeawayOrders } from "./takeaway-demo-data";
import type { TakeawayOfflineOrder } from "./takeaway-offline-order";
import type { TakeawayOrderLineItem } from "./takeaway-order-types";
import { formatAlgeriaPhoneDisplay, phoneKey } from "./takeaway-phone-utils";
import { customersFromOrders } from "./takeaway-seed-saved-customers";

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `tw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface AddPosTakeawayOrderInput {
  customer: TakeawayCustomer;
  items: TakeawayOrderLineItem[];
  kitchenNotes: string;
  totalAmountDa: number;
}

interface TakeawayQueueState {
  orders: TakeawayOfflineOrder[];
  savedCustomers: TakeawayCustomer[];
  patchOrder: (id: string, patch: Partial<TakeawayOfflineOrder>) => void;
  startPreparing: (id: string) => void;
  markReady: (id: string) => void;
  /** Records `deliveredAtMs` for financial / shift reporting. */
  markDelivered: (id: string) => void;
  cancelOrder: (id: string) => void;
  addOrderFromPos: (input: AddPosTakeawayOrderInput) => void;
}

const initialOrders = createInitialTakeawayOrders();

export const useTakeawayQueueStore = create<TakeawayQueueState>((set, get) => ({
  orders: initialOrders,
  savedCustomers: customersFromOrders(initialOrders),

  patchOrder: (id, patch) =>
    set((s) => ({
      orders: s.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),

  startPreparing: (id) => {
    const t = Date.now();
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === id ? { ...o, status: "preparing" as const, estimatedReadyAtMs: t + 15 * 60_000 } : o,
      ),
    }));
  },

  markReady: (id) => get().patchOrder(id, { status: "ready" }),
  markDelivered: (id) => {
    const t = Date.now();
    get().patchOrder(id, { status: "delivered", deliveredAtMs: t });
  },
  cancelOrder: (id) => get().patchOrder(id, { status: "cancelled" }),

  addOrderFromPos: ({ customer, items, kitchenNotes, totalAmountDa }) => {
    set((s) => {
      const maxNum = s.orders.reduce((m, o) => Math.max(m, o.takeawayNumber), 0);
      const t = Date.now();
      const ref = `#${(t % 9000) + 1000}`;
      const phone = formatAlgeriaPhoneDisplay(customer.phone);
      const pk = phoneKey(phone);
      const newOrder: TakeawayOfflineOrder = {
        id: newId(),
        takeawayNumber: maxNum + 1,
        posReference: ref,
        customerName: customer.name.trim(),
        customerPhone: phone,
        customerAddress: customer.address.trim(),
        customerDeliveryNotes: customer.notes.trim(),
        items,
        kitchenNotes,
        totalAmountDa,
        status: "new",
        createdAtMs: t,
        estimatedReadyAtMs: t + 20 * 60_000,
      };

      const merged: TakeawayCustomer = {
        ...customer,
        id: customer.id || newId(),
        name: customer.name.trim(),
        phone,
        address: customer.address.trim(),
        notes: customer.notes.trim(),
      };

      let savedCustomers = [...s.savedCustomers];
      const idx = savedCustomers.findIndex((c) => phoneKey(c.phone) === pk);
      if (idx >= 0) {
        const prev = savedCustomers[idx]!;
        savedCustomers[idx] = { ...prev, ...merged, id: prev.id };
      } else {
        savedCustomers = [...savedCustomers, merged];
      }

      return { orders: [...s.orders, newOrder], savedCustomers };
    });
  },
}));
