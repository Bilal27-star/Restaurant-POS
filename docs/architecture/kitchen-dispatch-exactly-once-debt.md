# Technical debt — exactly-once kitchen dispatch

**Status:** Open  
**Last audited:** 2026-06-02  
**Related work:** Replay-safety foundation (`OrderLineMutationIdempotency`, `inserted` / `applied` kitchen gates)

This note records remaining gaps in **system-wide exactly-once kitchen dispatch**. Replay duplicate printing is mitigated for protected mutations when `clientMutationId` is present; the items below are what still prevent claiming full exactly-once semantics.

---

## Summary

| Gap | Severity | Blocks delta printing? |
|-----|----------|------------------------|
| `patchOrder` reprint | Medium | Indirectly (noise + wrong mental model) |
| Post-commit crash window | High | Yes (missed tickets) |
| Legacy paths without `clientMutationId` | Medium | Yes (duplicate full tickets) |
| No print ledger | High (recommended) | Yes (foundational) |

---

## 1. `patchOrder` reprint issue

### What happens today

`OrdersService.patchOrder` always calls `scheduleKitchenJobsForOrder` after any successful metadata patch, with no distinction between kitchen-relevant changes and lifecycle-only updates.

```typescript
// apps/api/src/modules/orders/orders.service.ts
).then(async (o) => {
  void this.scheduleKitchenJobsForOrder(o.id);
  getRealtimeHub()?.publishOrderUpdated(o, { op: "patch" });
  return this.serializeOrder(o);
});
```

### Why it matters

- **Kitchen page** (`apps/web/src/pages/kitchen-page.tsx`) patches `status: "READY"` or completes orders. That status change triggers a **full kitchen reprint** of all stations — unintended and unrelated to offline replay.
- Any waiter patch (notes, party size, waiter, tax) also reprints the entire order.
- Violates exactly-once: one logical “kitchen send” can produce many physical tickets over an order’s lifetime without a new line mutation.

### Recommended direction (future)

- Remove kitchen dispatch from `patchOrder` by default.
- Optionally print only when `kitchenNotes` changes (explicit order-level note ticket), or route through a dedicated “reprint kitchen” admin action.
- Never print on `status`-only patches.

### Key files

- `apps/api/src/modules/orders/orders.service.ts` — `patchOrder`
- `apps/web/src/pages/kitchen-page.tsx` — status updates

---

## 2. Post-commit crash window

### What happens today

Idempotency is recorded **inside** the repository transaction (order row or `OrderLineMutationIdempotency`). Kitchen dispatch runs **after** commit, via fire-and-forget:

```typescript
// apps/api/src/modules/orders/orders.service.ts
if (inserted) {
  void this.scheduleKitchenJobsForOrder(o.id);
}
// same pattern: if (applied) { void this.scheduleKitchenJobsForOrder(...) }
```

`scheduleKitchenJobsForOrder` is not awaited and is not part of the same database transaction as the mutation ledger.

### Failure mode

1. HTTP handler commits mutation + idempotency record (`inserted: true` or `applied: true`).
2. Process crashes (or request aborts) **before** print jobs are enqueued.
3. Client or outbox replays with the same `clientMutationId`.
4. Server returns replay response (`inserted: false` / `applied: false`) and **skips kitchen dispatch**.
5. **Result:** order lines exist in DB, idempotency says “already done,” kitchen never receives a ticket.

This is **at-most-once** print, not exactly-once. Replay safety prevents **duplicate** prints but cannot **recover** a missed print.

### Recommended direction (future)

- Tie “kitchen dispatched for this mutation” to durable state in the same transaction or an immediate follow-up with compensating replay:
  - Option A: print ledger row (see §4) created in-tx with status `PENDING`, worker marks `ENQUEUED`; replay retries enqueue if still `PENDING`.
  - Option B: idempotency record stores `kitchenDispatched: boolean`; replay path enqueues if mutation applied but `kitchenDispatched === false`.
- Await or reliably queue print before returning HTTP 200, or return a response flag so the client can retry print-only recovery.

### Key files

- `apps/api/src/modules/orders/orders.service.ts` — all `scheduleKitchenJobsForOrder` call sites
- `apps/api/src/modules/orders/orders.repository.ts` — mutation + idempotency transactions

---

## 3. Legacy paths without `clientMutationId`

### What happens today

Replay idempotency is **optional**:

| Operation | Server idempotency | When `clientMutationId` omitted |
|-----------|-------------------|----------------------------------|
| `order.create` | `Order.offlineClientMutationId` | New order + kitchen print on every call |
| `order.line.add` | `OrderLineMutationIdempotency` | Append lines + kitchen print on every call |
| `order.line.update` | Same ledger | Update + kitchen print on every call |
| `order.line.delete` | Same ledger | Delete + kitchen print on every call |

POS paths that **do** send `clientMutationId`:

- Offline dine-in `order.create` and `order.line.add` (outbox + online add).
- Online dine-in create/add, takeaway create, tables-page add-items.

Paths that **may omit** it:

- Direct API / integration callers.
- Older clients or manual `curl` / Postman.
- Stale outbox replay without version + without `clientMutationId` on line add (409 retry loop or duplicate append).

Without a key, the server cannot distinguish first execution from replay; each HTTP success enqueues another **full** kitchen ticket.

### Recommended direction (future)

- Require `clientMutationId` on all kitchen-triggering mutations (breaking change for external API) **or**
- Accept optional key but document that omitting it forfeits replay guarantees **or**
- Auto-generate server-side dedupe from `(orderId, mutationKind, payloadHash)` for online-only callers (weaker than client UUID).

### Key files

- `apps/api/src/modules/orders/orders.validation.ts` — optional `clientMutationId`
- `apps/web/src/offline/pos-rest-cloud-transport.ts` — injects key from outbox
- `apps/web/src/components/pos/pos-workspace.tsx` — generates UUID for create/add

---

## 4. Future print-ledger recommendation

### Problem

Today, kitchen dispatch is a **side effect** of order mutation handlers. Idempotency tracks **data** mutations, not **print** side effects. That split causes both duplicate prints (legacy / `patchOrder`) and missed prints (post-commit crash).

### Recommended model: `KitchenPrintLedger` (or extend idempotency)

Per logical kitchen dispatch attempt, record:

| Field | Purpose |
|-------|---------|
| `restaurantId` | Tenant scope |
| `clientMutationId` | Align with offline outbox (unique per restaurant) |
| `orderId` | Parent order |
| `mutationKind` | `CREATE`, `LINE_ADD`, `LINE_UPDATE`, `LINE_DELETE`, `MANUAL_REPRINT`, … |
| `status` | `PENDING` → `ENQUEUED` → `COMPLETED` / `FAILED` |
| `enqueuedAt` / `completedAt` | Audit |
| `printJobIds` | Optional link to `PrintJob` rows |

**Flow:**

1. In the same transaction as the mutation (or immediately after with serializable guard), insert ledger row `PENDING`.
2. Dispatch service enqueues station jobs; updates ledger to `ENQUEUED` with job IDs.
3. On replay with same `clientMutationId`:
   - If ledger `COMPLETED` or `ENQUEUED` → skip print.
   - If ledger `PENDING` (crash window) → retry enqueue only.
4. Delta printing (future) attaches **line IDs** and ticket mode (`NEW` / `UPDATE`) to ledger payload snapshot.

### Benefits

- Exactly-once (or at-least-once with idempotent enqueue) for physical tickets.
- Clear audit trail for support (“why didn’t table 5 print?”).
- Natural hook for delta dispatch without reusing full-order `scheduleKitchenJobsForOrder`.
- Decouples kitchen from `patchOrder` and non-kitchen mutations.

### Relationship to current schema

- `OrderLineMutationIdempotency` — mutation dedupe (keep).
- `PrintJob` — transport queue (keep); ledger references job IDs.
- New table or columns — print intent vs mutation intent.

---

## What is already solved (context)

Do not re-implement; build delta printing on top:

- **`order.create` replay:** `offlineClientMutationId` + print only when `inserted === true`.
- **Line mutation replay:** `OrderLineMutationIdempotency` + print only when `applied === true`.
- **Offline transport:** `pos-rest-cloud-transport.ts` injects `op.clientMutationId` for create and line ops.

---

## Suggested resolution order

1. **Stop `patchOrder` kitchen prints** — low risk, immediate noise reduction.
2. **Introduce print ledger + pending retry on replay** — closes crash window.
3. **Require or strongly encourage `clientMutationId`** on kitchen paths.
4. **Delta dispatch service** — replace full-order `scheduleKitchenJobsForOrder` for line mutations; use ledger payload.

---

## References

- Replay audit (pre-foundation): conversation / architecture review 2026-05-30
- Final architecture audit: 2026-06-02 — exactly-once kitchen dispatch **FAIL**
- Migration: `20260530120000_order_line_mutation_idempotency`
- Related doc: `packages/database/docs/DATABASE-ARCHITECTURE.md` (sync / idempotency overview)
