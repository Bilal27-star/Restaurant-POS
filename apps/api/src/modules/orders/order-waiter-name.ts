type OrderWaiterNameSource = {
  waiterName?: string | null;
  waiter?: { fullName?: string | null } | null;
};

/** POS free-text name first; linked user full name as legacy fallback only. */
export function resolveOrderWaiterName(order: OrderWaiterNameSource): string | null {
  const custom = order.waiterName?.trim();
  if (custom) return custom;
  const linked = order.waiter?.fullName?.trim();
  return linked || null;
}
