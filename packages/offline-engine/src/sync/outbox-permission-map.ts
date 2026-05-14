import type { OutboxOperationKind } from "./outbox-types.js";

/** Minimum API permission codes required to queue an offline mutation (mirrors server RBAC). */
const KIND_TO_PERMISSIONS: Partial<Record<OutboxOperationKind, readonly string[]>> = {
  "order.create": ["orders:create"],
  "order.patch": ["orders:update"],
  "order.line.add": ["orders:update"],
  "order.line.update": ["orders:update"],
  "order.line.delete": ["orders:update"],
  "order.complete": ["orders:update"],
  "order.cancel": ["orders:delete"],
  "payment.capture": ["payments:process"],
  "payment.refund": ["payments:refund"],
  "shift.open": ["shifts:open"],
  "shift.close": ["shifts:close"],
  "expense.record": ["expenses:manage"],
  "table.update": ["tables:manage"],
};

export function assertOutboxEnqueueAllowed(kind: OutboxOperationKind, userPermissions: readonly string[]): void {
  if (kind === "print.job") return;
  const required = KIND_TO_PERMISSIONS[kind];
  if (!required?.length) {
    throw new Error(`OFFLINE_OUTBOX_UNKNOWN_KIND:${kind}`);
  }
  const set = new Set(userPermissions);
  const ok = required.some((p) => set.has(p));
  if (!ok) {
    throw new Error(`OFFLINE_OUTBOX_FORBIDDEN:${kind}`);
  }
}
