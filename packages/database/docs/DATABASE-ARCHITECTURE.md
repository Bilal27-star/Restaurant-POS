# Restaurant POS — database architecture

This document describes the **production Prisma schema** in `prisma/schema.prisma`: models, enums, relations, indexing strategy, and how the design scales toward **multi-site chains**, **offline-first**, and **heavy analytics**.

---

## Suggested repository layout (backend growth)

```
packages/database/          ← this package (Prisma + shared client)
  prisma/
    schema.prisma           ← single schema file (split with `prisma/*.prisma` when > ~1.5k lines)
    migrations/             ← created by `prisma migrate dev`
  src/
    client.ts               ← PrismaClient singleton
    index.ts                ← public exports
  docs/
    DATABASE-ARCHITECTURE.md

apps/api/                   ← future Express app (not in scope now)
  src/
    modules/
      auth/
      orders/
      tables/
      payments/
      shifts/
      menu/
    config/
    middleware/
```

Contracts (`packages/contracts`) can mirror DTOs; the database package stays the **single source of truth** for persistence shape.

---

## Tenancy model (v1)

- **`Restaurant`** is the **tenant boundary**. Almost every business table carries `restaurantId` for row-level isolation and simpler backup/sharding later.
- **`User`** is scoped to **one restaurant** in v1 (`user.restaurant_id` required). This matches single-location deployments and keeps joins cheap.
- **`Role`** rows are **per restaurant** (`role.restaurant_id` required). On restaurant creation, seed the four system roles (`ADMIN`, `MANAGER`, `CASHIER`, `WAITER`) and attach permissions via `RolePermission`.

**Scale-out path:** introduce `Organization` → many `Restaurant`s, then `UserAccount` (global) + `RestaurantMembership` (user ↔ restaurant) + optional `membership_id` on `UserRole`. The current schema avoids premature complexity while keeping FK patterns compatible with that migration.

---

## Model groups (what each is for)

### 1. Users & authentication

| Model | Purpose |
|--------|---------|
| **User** | Staff identity: login, optional PIN hash, profile, soft-delete. `version` supports optimistic concurrency for sync. |
| **Role** | Named role bound to a restaurant; `RoleCode` enum for the four built-ins; `is_system` distinguishes seeded vs custom roles. |
| **Permission** | Global permission catalog (`code` unique, e.g. `orders:create`). |
| **RolePermission** | M2M role ↔ permission. |
| **UserRole** | M2M user ↔ role (users can hold multiple roles). |
| **Session** | Server-side session: **hashed** token, expiry, optional IP / user-agent, revocation. |

**Security notes:** store only **hashed** secrets (`hashed_password`, `pin_hash`). Never persist refresh tokens in plain text; hash like sessions.

### 2. Floors & tables

| Model | Purpose |
|--------|---------|
| **RestaurantFloor** | Optional grouping for floor plans. |
| **RestaurantTable** | Table number (string for `A3`), `capacity`, `TableStatus`, optional `current_order_id` for fast POS lookup. |
| **TableReservation** | Holds reservation metadata when status is `RESERVED` (party, window). |

`current_order_id` is denormalized: it must reference the **open** order for that table. Application rules (or DB trigger) should clear it when the order reaches a terminal state.

### 3. Menu

| Model | Purpose |
|--------|---------|
| **MenuCategory** | Catalog sections; soft-delete. |
| **MenuItem** | Dish: pricing, flags, image URL, `version` for sync. |
| **Ingredient** | Line on a recipe card; `removable`, `sort_order`. |
| **Modifier** | Extra priced option on an item. |
| **MenuItemModifier** | Explicit M2M between item and modifier so you can later swap in **shared modifier definitions** without breaking `OrderItemModifier` lineage. |

### 4. Customers

| **Customer** | CRM-lite: name, phone, address, notes; `orders` provide history. |

### 5. Orders

| Model | Purpose |
|--------|---------|
| **Order** | `OrderType` (`DINE_IN` \| `TAKEAWAY`), `OrderStatus` lifecycle, monetary columns, `OrderPaymentStatus` for settlement, `order_number` unique per restaurant. Links table, customer, waiter, optional `created_by`. |
| **OrderItem** | Line with **snapshots** (`name_snapshot`, `unit_price`) so menu edits never rewrite history. |
| **OrderItemModifier** | Applied modifiers on a line; optional FK to catalog `Modifier` for reporting. |

Indexes favour: open orders by table, day-part analytics by `created_at`, takeaway vs dine-in splits.

### 6. Payments & cash

| Model | Purpose |
|--------|---------|
| **Payment** | Split-tender ready: multiple payments per order. Cash fields: `amount_received`, `change_given`. `idempotency_key` prevents double-post from flaky POS networks. |
| **Refund** | Financial correction linked to payment + order. |
| **CashTransaction** | **Append-only** drawer ledger: links shift, optional payment/expense, typed line (`CashTransactionType`). |

### 7. Shifts & expenses

| Model | Purpose |
|--------|---------|
| **Shift** | Opening float, closing count, expected vs actual, variance, lifecycle `ShiftStatus`. |
| **ExpenseCategory** | Per-restaurant row per `ExpenseCategoryCode` (seed seven codes + allow custom display `name`). |
| **Expense** | Cash-out from a shift with category and `PaymentMethod` (how it hit the drawer). |

### 8. Analytics

- **Primary facts:** `Order`, `Payment`, `OrderItem` — sufficient for revenue, payment mix, top SKUs, peak hours (hour-of-day from `created_at` / `opened_at`).
- **`DailySalesSnapshot`:** optional **pre-aggregated** row per `(restaurant_id, business_date)` for fast dashboards and mobile KPIs. `detail_json` can store histograms (e.g. hour → sales) without exploding normalized table count.

### 9. System settings

| **SystemSettings** | 1:1 with `Restaurant`. Fixed columns for identity; `settings_json` for printers, tax rules, receipt templates, locale — validated in application code and versioned with `version`. |

### 10. Offline-first readiness

| Model | Purpose |
|--------|---------|
| **RegisteredDevice** | Known POS terminals / kiosks. |
| **SyncMutation** | **Outbox**: client-generated `client_mutation_id`, payload, retry state — for upload sync when connectivity returns. |

**Concurrency:** `version` on `User`, `MenuItem`, `MenuCategory`, `RestaurantTable`, `Order` supports last-write-wins or merge policies in the sync engine.

**Future:** add `external_id` / `origin_device_id` on hot entities if you adopt CRDT or per-device id spaces; add `deleted_at` to `Order` only if regulatory retention requires soft-delete of tickets.

---

## Enums (summary)

- **User:** `UserStatus`
- **RBAC:** `RoleCode`
- **Tables:** `TableStatus` (includes `PAYMENT_PENDING` as requested)
- **Orders:** `OrderType`, `OrderStatus`, `OrderPaymentStatus`
- **Payments:** `PaymentMethod`, `PaymentStatus`
- **Shift:** `ShiftStatus`
- **Expenses:** `ExpenseCategoryCode`
- **Cash ledger:** `CashTransactionType`
- **Sync:** `SyncMutationStatus`

---

## Indexing & constraints philosophy

- Every list screen gets a composite index starting with **`restaurant_id`**.
- Money uses **`Decimal(14, 2)`** — adjust precision if you add high-volume micro-payments or multi-currency conversion tables later.
- **Restrict** deletes on entities referenced by financial history (`Order` ← `Payment`, `MenuCategory` ← `MenuItem` with live orders) vs **Cascade** for pure composition (order → items).
- **Unique** `order_number` per restaurant; **unique** `client_mutation_id` globally for outbox deduplication.

---

## Cascading rules (high level)

- Deleting a **restaurant** cascades to owned staff, menu, tables, settings, snapshots, devices, sync rows.
- Deleting an **order** cascades line items and refunds; payments are **Restrict** (void payments explicitly before order delete, or use soft-delete on orders only).
- **MenuItem** delete: `Restrict` from category if items exist — prefer soft-delete on `MenuItem`.

---

## Future scalability notes

1. **Read replicas:** analytics queries and snapshot builders should use a replica; Prisma datasource read replicas when you adopt them.
2. **Partitioning:** partition `orders`, `payments`, `cash_transactions` by **month** on `created_at` once volume exceeds ~10M rows/tenant.
3. **Event sourcing:** `CashTransaction` is already event-like; you can add `domain_events` table later without invalidating this schema.
4. **Multi-currency:** add `currency_code` on `Payment` / `Order` if you bill in more than the restaurant default.
5. **Tax lines:** add `OrderTaxLine` when jurisdictions require line-level tax breakdown.
6. **Inventory:** not in this schema; add `StockItem`, `StockMovement` in a separate bounded context to avoid coupling kitchen inventory to menu pricing.

---

## Environment

Set `DATABASE_URL` for CLI and runtime (see `.env.example` in this package).

```bash
cd packages/database
DATABASE_URL="postgresql://..." npx prisma migrate dev --name init
```

---

## Maintenance

- Regenerate client after schema changes: `pnpm --filter @pos/database generate`
- Keep migrations **small and descriptive**; never edit applied migration SQL in production—add forward migrations only.

This schema is intended to be **boring, explicit, and auditable** — the hallmark of production POS backends.
