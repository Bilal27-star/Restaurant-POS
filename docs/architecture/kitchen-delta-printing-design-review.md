# Kitchen Delta Printing — Principal Architect Review

**Reviewed document:** [kitchen-delta-printing-design.md](./kitchen-delta-printing-design.md) (v1.0)  
**Reviewer role:** Principal software architect (adversarial review)  
**Date:** 2026-06-02  
**Verdict:** See [§12 Final recommendation](#12-final-recommendation)  
**Status:** Mandatory changes incorporated in design **v2.1** — that document is the implementation source of truth.

---

## Executive summary

The design correctly identifies the root cause (full-order reload on every mutation) and proposes a sound direction: per-line kitchen state, delta intents, station-scoped tickets, and phased delivery. It aligns with the existing replay-safety foundation (`clientMutationId`, `OrderLineMutationIdempotency`, `inserted` / `applied` gates).

However, the design has **internal inconsistencies** (when item state is updated vs when print is confirmed), **defers critical exactly-once mechanics to Phase 4**, and **under-specifies** failure handling, multi-device behavior, and quantity/modifier semantics. Shipping Phases 2–3 without the print ledger would **trade one class of bugs (duplicate full tickets) for another (missed deltas + stuck `kitchen_status`)**.

**Recommendation: B — Design approved with changes** (mandatory revisions listed in §12).

---

## 1. Hidden edge cases

| # | Edge case | Severity | Probability | Mitigation |
|---|-----------|----------|-------------|------------|
| H1 | **`createOrder` + table already has open order** — repository returns `inserted: false` without storing `offlineClientMutationId` on the existing order. First and replay both skip kitchen print; waiter may believe items were sent. | High | Medium | Detect table-open short-circuit; either merge lines into open order with explicit send, or return 409 with clear client action. Do not silently skip print on first attempt. |
| H2 | **Edit before first send** — line stays `PENDING`; waiter changes qty/modifiers then sends. Design does not state whether `updateLine` on `PENDING` produces UPDATE ticket or is suppressed until batch NEW. | Medium | High | Rule: `PENDING` edits mutate cart only; **no kitchen ticket** until explicit send. `updateLine` on `PENDING` → no print; include final snapshot in NEW ticket. |
| H3 | **Same item, two line rows** — POS adds “Pizza x1” twice as separate `order_items` vs one row qty 2. Delta prints two NEW lines; kitchen sees duplicate entries. | Low | High | Product rule in POS (merge lines) or ticket grouping by `menuItemId` + modifier fingerprint (optional v2). Document as accepted v1 behavior. |
| H4 | **Silent station drop** — items with no resolvable `KitchenStation` are omitted (same as today). Waiter thinks send succeeded; kitchen never sees item. | High | Medium | Fail loud: if any delta line unroutable, return 422 with item names; or enqueue fallback “expeditor” printer. |
| H5 | **Offline ordering** — `order.line.add` requires server `orderId`; offline `order.create` clears cart without hydrating `activeOrderId`. Second batch offline add impossible until sync + re-open table. | Medium | Medium | Document; future: local provisional order ID map (`local_entities` in offline-engine DDL). Out of v1 scope but affects field ops. |
| H6 | **Takeaway / no table** — header shows EMPORTER; station routing unchanged. Delta INFO “all stations TBD” may miss drinks-only updates. | Low | Medium | Define INFO routing: broadcast to all stations with active printers, or single configured “pass” printer. |
| H7 | **Shadow mode (Phase 1)** — logs intent but still full-prints. Operators see **both** behaviors in logs vs paper; false confidence in detector. | Low | High | Short shadow window; automated diff test intent vs full payload before cutover. |
| H8 | **`tables-page` addLines** — adds items without draft-line UX; always immediate send. Different from POS draft/send model; delta still works but mental model differs. | Low | High | Document; ensure `clientMutationId` always sent (already in codebase). |
| H9 | **Payment capture auto-completes order** — lines may be mid-prep; no CANCEL ticket on complete. Kitchen learns via KDS only. | Medium | Low | Explicit policy: complete → optional station void ticket (design marks optional). Decide before Phase 2. |
| H10 | **Internal design contradiction** — §6.5 says state updates only when `inserted/applied`; Phase 2 says “after successful dispatch.” If dispatch fails after DB marks `SENT`, state lies. | High | High | Single rule: **`SENT` only when print ledger reaches `ENQUEUED`** (or job created). See §3. |

---

## 2. Data model weaknesses

| # | Weakness | Severity | Probability | Mitigation |
|---|----------|----------|-------------|------------|
| D1 | **`CANCELLED` on deleted row** — §6.2 says “soft; row deleted from DB” but `deleteLine` hard-deletes `order_items`. Status `CANCELLED` cannot persist post-delete. | High | Certain | Capture **snapshot JSON** in delta intent / print ledger at delete time; do not rely on row after delete. Optional `order_item_kitchen_audit` append-only log. |
| D2 | **No “last sent snapshot”** — delta detection via optional `kitchen_content_hash` but hash algorithm and stored baseline undefined. `MODIFIED` enum alone insufficient for modifier diffs. | High | High | Add `kitchen_last_sent_snapshot Json?` on `OrderItem` (qty, modifier labels, removed ingredients, notes) or store only on ledger entries. |
| D3 | **`MODIFIED` vs `PENDING` overlap** — edit after send → `MODIFIED`; edit before send → still `PENDING`. Detector must branch; design does not formalize. | Medium | High | See H2; document transition table in schema spec. |
| D4 | **Dual idempotency tables** — `OrderLineMutationIdempotency` and proposed `KitchenPrintIntent` both keyed by `(restaurantId, clientMutationId)`. Same UUID, different semantics; risk of drift. | Medium | Medium | Merge into one **mutation receipt** row with `mutationApplied` + `printStatus`, or FK from intent to line-mutation ledger. |
| D5 | **Per-station vs per-mutation ledger** — one `clientMutationId` can produce N station jobs. Ledger schema shows one row per mutation; partial station enqueue unclear. | High | Medium | Model `KitchenPrintIntent` (parent) + `KitchenPrintIntentStation` (child per station) with independent status. |
| D6 | **`menuItemId` SetNull** — if menu item deleted, routing breaks on UPDATE/CANCEL replay from snapshot. | Medium | Low | Route from snapshot station stored at first send; denormalize `kitchen_station` on `OrderItem` at send time. |
| D7 | **No order-level dispatch generation** — cannot detect “full reprint” vs “incremental send #3” for audit. | Low | Medium | Optional `orders.kitchen_dispatch_generation` counter incremented per successful intent. |

---

## 3. Replay-safety risks

| # | Risk | Severity | Probability | Mitigation |
|---|------|----------|-------------|------------|
| R1 | **Print ledger deferred to Phase 4** — Phases 2–3 cut over to delta while post-commit crash window remains ([debt doc §2](./kitchen-dispatch-exactly-once-debt.md)). Replay prevents duplicate print but **cannot recover missed delta**. | Critical | Medium | **Block Phase 2 cutover** until minimal print ledger exists (at least `PENDING` → `ENQUEUED`). Do not treat ledger as optional. |
| R2 | **State advance before print confirm** — if `kitchen_status → SENT` happens in mutation tx, replay (`applied: false`) never retries print for lines stuck `PENDING` on failed first dispatch. | High | Medium | Advance state only in ledger completion path; mutation tx sets `PENDING`/`MODIFIED` only. |
| R3 | **Replay skips state touch (§6.5)** — correct for duplicates, but masks R1/R2: support cannot “replay print” via same `clientMutationId`. | Medium | Certain | Admin **print-only recovery** endpoint keyed by `orderId` + line IDs, not mutation replay. |
| R4 | **`clientMutationId` still optional** — API allows omit; delta + replay guarantees void. | Medium | Low | Require key on all kitchen-triggering endpoints before delta GA; 400 if missing. |
| R5 | **Outbox always `accepted`** — transport never returns `idempotent`; client marks completed even when server skipped print on replay (correct) but also when server missed print (incorrect). | Medium | Low | Response header or body: `mutationApplied`, `kitchenDispatched`; client logs mismatch. |
| R6 | **create replay + table-open** — H1 combined with replay: outbox completes, kitchen never gets ticket, no ledger row. | High | Low | Fix table-open path; store mutation id on order or reject create. |

---

## 4. Multi-device synchronization risks

| # | Risk | Severity | Probability | Mitigation |
|---|------|----------|-------------|------------|
| M1 | **Concurrent `addLines`** — optimistic `version` → 409; offline retry without version refresh (`baseServerVersion` unused). One device wins; other dead-letters or duplicates without `clientMutationId`. | High | Medium | On 409, refresh order version in outbox payload before retry; require `clientMutationId`. |
| M2 | **Device A sends kitchen, Device B adds lines** — B’s lines correctly NEW; A’s UI may show stale cart until invalidate. No print issue if server authoritative. | Low | High | Server-side state is source of truth; ensure serialized order includes `kitchenStatus` per line for UI badges. |
| M3 | **Two POS terminals, one order** — rare but possible (shared table). Two different `clientMutationId`s for simultaneous adds → two correct NEW tickets. Expected. | Low | Low | Accept; not a bug. |
| M4 | **Kitchen display vs print divergence** — kitchen page patches `status` without print after fix; staff relying on accidental reprint lose sync cue. | Medium | Medium | KDS/realtime must show order state; train staff; optional READY chime on KDS not printer. |
| M5 | **Realtime event without kitchen fields** — `serializeOrder` likely omits `kitchenStatus`; devices disagree on “sent to kitchen.” | Medium | High | Extend order DTO with per-line `kitchenStatus` for POS badges (“en attente cuisine”). |

---

## 5. Kitchen routing risks

| # | Risk | Severity | Probability | Mitigation |
|---|------|----------|-------------|------------|
| K1 | **Live menu routing vs historical line** — delta UPDATE uses current `menuItem.kitchenStation`; admin moved item Pizza→Snack after send → UPDATE goes to wrong station. | High | Medium | **Denormalize `kitchen_station`** on `OrderItem` at first send; route deltas by stored value. |
| K2 | **Heuristic misclassification** — `resolveKitchenStation(name)` differs from explicit enum; behavior unchanged from today but delta amplifies “wrong station once” vs “wrong station every reprint.” | Medium | Medium | Prefer explicit `kitchenStation` on menu; seed data QA; log overrides. |
| K3 | **INFO ticket routing TBD** — order-level allergy note may need all stations; design unset. | Medium | High | Config: `settingsJson.kitchenInfoBroadcast`: `ALL_STATIONS` \| `NONE` \| station list. |
| K4 | **Cross-station single mutation** — one `addLines` with pizza + drink → two jobs (correct). Partial printer failure → one station unaware (see §6). | Medium | Medium | Per-station ledger status; retry failed station only. |
| K5 | **Unrouted item in multi-item send** — partial enqueue succeeds; design unclear if mutation fails entirely or partial. | High | Medium | All-or-nothing: if any line unroutable, fail request before mutation commit OR hold unroutable lines as `PENDING` with user warning. |

---

## 6. Printer failure scenarios

| # | Scenario | Severity | Probability | Mitigation |
|---|----------|----------|-------------|------------|
| P1 | **`PrintJob` fails after max attempts** — job DEAD; line already `SENT`. Kitchen never saw item; no auto retry. | Critical | Medium | Link ledger → job; on DEAD, revert line to `MODIFIED` or flag `kitchen_print_failed`; surface alert in POS. |
| P2 | **Partial multi-station enqueue** — pizza job succeeds, plats job fails. Order partially known to kitchen. | High | Medium | Station-child ledger; independent retry; do not mark all lines `SENT` until their station job enqueued. |
| P3 | **LAN printer offline at claim time** — worker retries 3x (`thermal-print-worker`); then fail. No webhook to order service. | High | High | Existing queue; add ops dashboard for failed jobs; manual reprint flow. |
| P4 | **No printer configured for station** — `ensureKitchenPrinter` fallback may point to invalid device. | High | Low | Pre-flight validate printer reachable on send; block with settings link. |
| P5 | **Desktop worker not running** — jobs pile PENDING; lines marked SENT incorrectly if state tied to enqueue not completion. | High | Medium | Ledger `ENQUEUED` vs `COMPLETED`; optional worker heartbeat in settings UI. |
| P6 | **Duplicate worker claim** — low risk if single desktop per restaurant; multiple claimants undefined. | Low | Low | Document one print worker per venue; job locking already in API. |

---

## 7. Reopen / merge / split order problems

| # | Problem | Severity | Probability | Mitigation |
|---|---------|----------|-------------|------------|
| O1 | **Not implemented** — design correctly defers; no API today. | — | — | Reserve `INFO` + `FULL_REPRINT` modes; do not implement until product spec exists. |
| O2 | **Future reopen** — completed order reopened (if ever) would need all lines `PENDING` or forced full reprint; undefined. | High | Low | Policy doc: reopen → `FULL_REPRINT` all open lines; reset `kitchen_status`. |
| O3 | **Future merge** — source order lines moved to target; kitchen history split across orders. | High | Low | Merge → CANCEL tickets on source stations + NEW on target; requires line ID remap table. |
| O4 | **Future split** — line subset to new order; delta state must fork. | High | Low | Split → snapshot kitchen state per line; new order lines start as `PENDING` or inherit `SENT` with INFO ticket. |
| O5 | **Table transfer (future)** — fixed `tableId` at create; transfer needs INFO ticket with new table on all affected stations. | Medium | Low | Design mentions INFO; add `TABLE_CHANGE` section template when API exists. |

**Current codebase:** no reopen/merge/split/table-transfer order APIs — **no immediate implementation risk**, but data model should not foreclose append-only kitchen audit log.

---

## 8. Modifier update corner cases

| # | Corner case | Severity | Probability | Mitigation |
|---|-------------|-------------|-------------|------------|
| X1 | **Modifier identity** — POS sends `modifierIds[]` with duplicates for qty; comparison must be **multiset**, not set. | High | High | Canonicalize to sorted `(modifierId, count)` before hash/compare. |
| X2 | **Label-only snapshot** — modifiers stored as `OrderItemModifier` rows with labels; menu label edit changes diff without waiter action. | Low | Low | Compare by `modifierId` where present, else label snapshot. |
| X3 | **removedIngredients vs modifiers** — both affect kitchen text; diff must include both channels. | Medium | High | Include in `kitchen_last_sent_snapshot`; template shows SANS/+ lines separately. |
| X4 | **Swap modifier A→B** — should show −A +B, not full line replace. | Medium | High | Diff engine produces modifier `added[]` / `removed[]` arrays in MODIFY section. |
| X5 | **UPDATE on never-sent line** — if `updateLine` wired in POS before send, must not emit UPDATE ticket (see H2). | Medium | Medium | Guard: `kitchen_status === PENDING` → suppress UPDATE print. |
| X6 | **Identical re-save** — hash match after spurious PATCH → suppress empty UPDATE. | Low | Medium | Compare snapshot hash; if equal, no print. |

---

## 9. Quantity decrease edge cases

| # | Edge case | Severity | Probability | Mitigation |
|---|-----------|----------|-------------|------------|
| Q1 | **3 → 1 after kitchen started 3** — UPDATE shows “−2” but 2 portions may already be cooking. | Medium | High | Template language: “AJUSTEMENT” not “ANNULATION”; ops training. Optional: threshold → CANCEL + NEW instead of delta. |
| Q2 | **1 → 0 via deleteLine** — CANCEL ticket (correct). | Low | High | Ensure snapshot qty on ticket matches **sent** qty, not pre-delete DB state. |
| Q3 | **Decrease then increase before dispatch** — net zero change; should suppress print. | Medium | Medium | Compare against last **sent** snapshot, not previous edit. |
| Q4 | **No qty=0 update path** — only deleteLine removes lines; POS may not expose delete of sent lines yet. | Medium | High | When UI added, wire `deleteLine` + CANCEL; until then, document gap. |
| Q5 | **addLines adds qty as new row vs updateLine** — two mechanisms to increase qty; inconsistent delta semantics. | Medium | Medium | POS policy: increase qty → `updateLine`; new variants → `addLines`. |
| Q6 | **Split brain: line qty 2, kitchen printed 1** — not possible in system today (no partial send per line). | Low | — | N/A until fractional send exists. |

---

## 10. Migration risks

| # | Risk | Severity | Probability | Mitigation |
|---|------|----------|-------------|------------|
| G1 | **Backfill all open items → `SENT`** — items never physically printed will never auto-NEW on next send. | Critical | Medium | Runbook + **manual FULL_REPRINT** button before first shift after deploy; optional per-restaurant backfill flag `assumeKitchenSent: false`. |
| G2 | **Deploy Phase 2 without backfill** — next send prints entire order as NEW (duplicate prep). | Critical | Low | Enforce migration script in deploy pipeline; block feature flag without backfill checksum. |
| G3 | **Feature flag per restaurant** — mixed fleet during rollout; support confusion. | Medium | Medium | Flag in `settingsJson`; default off; enable per pilot site. |
| G4 | **Schema + code skew** — old API nodes with new DB enum. | Medium | Low | Standard rolling deploy; backward-compatible payload (`lines` fallback). |
| G5 | **Index name / Prisma drift** — already burned in prior migration validation. | Low | Medium | `migrate diff` in CI gate. |
| G6 | **Historical analytics** — `kitchen_status` not meaningful on closed orders. | Low | High | Backfill open only; closed orders null or `SENT` irrelevant. |

---

## 11. Cross-cutting gaps in the design document

| Gap | Impact |
|-----|--------|
| Phase ordering puts **ledger last** | Missed prints during pilot |
| `applyItemStateUpdates` “in same tx as mutation when possible” vs async dispatch | Transaction boundary unclear |
| `GET /print/kitchen` preview not updated for delta | Settings/debug misleading |
| Dead orchestrator code not scheduled for removal | Two dispatch paths remain confusing |
| Testing strategy lacks property-based / chaos (crash after commit) | Replay gaps undetected in CI |
| No observability metrics (`kitchen_delta_lines`, `kitchen_print_skipped`) | Production blind spots |

---

## 12. Final recommendation

### **B) Design approved with changes**

The architecture is **directionally correct** and worth implementing. It should **not** proceed to production delta cutover (Phase 2 GA) without the mandatory changes below.

### Mandatory changes before Phase 2 cutover

1. **Promote print ledger from Phase 4 to Phase 2 prerequisite** — minimum viable `KitchenPrintIntent` (+ per-station children) with `PENDING` / `ENQUEUED` / `FAILED`; replay retries enqueue when `PENDING`.
2. **Define `kitchen_last_sent_snapshot` (or equivalent)** — persist baseline for diffs; do not rely on enum alone.
3. **Fix delete semantics** — snapshot at delete; abandon `CANCELLED` on deleted row; use append-only audit or intent payload.
4. **Denormalize `kitchen_station` on `OrderItem` at first send** — stable routing for UPDATE/CANCEL.
5. **Formalize state rules:**
   - `PENDING` + edit → no UPDATE ticket;
   - `SENT` only when station job **ENQUEUED** (not merely mutation applied);
   - failed job → revert or flag line.
6. **Resolve INFO routing** in settings before implementing allergy notes.
7. **Fail or warn on unrouted delta lines** — no silent drop.
8. **Require `clientMutationId`** on kitchen-triggering mutations at GA.
9. **Migration runbook** — backfill + documented manual FULL_REPRINT for edge venues.
10. **Expose `kitchenStatus` on order API** for multi-device UI consistency.

### Acceptable deferrals (post-GA v2)

- Order merge / split / reopen / table transfer
- POS offline provisional order IDs
- Modifier multiset grouping on ticket
- KDS-first READY signaling

### Not approved as-is

- Treating Phase 4 ledger as optional
- Marking lines `SENT` before print job creation
- Relying on open-order backfill without recovery tooling

---

## 13. Suggested revised phase gate

| Phase | Gate |
|-------|------|
| **1 — Detection** | Snapshot + detector tests; shadow logging; **no** `SENT` writes |
| **1.5 — Ledger** | Print intent schema + enqueue linkage (can ship with Phase 1) |
| **2 — Generation** | Delta templates + **ledger-gated** state transitions |
| **3 — Routing** | Denormalized station + station-child retry |
| **4 — Hardening** | Require `clientMutationId`, admin FULL_REPRINT, metrics, chaos tests |

---

## References

- [kitchen-delta-printing-design.md](./kitchen-delta-printing-design.md)
- [kitchen-dispatch-exactly-once-debt.md](./kitchen-dispatch-exactly-once-debt.md)
- Replay-safety foundation: `OrderLineMutationIdempotency`, `orders.service.ts` `inserted` / `applied` gates
