# Architecture — folder layout & boundaries

This document mirrors the repository layout. Product UI and domain rules are intentionally omitted.

## Naming

| Layer | Convention | Example |
|-------|------------|---------|
| Workspace packages | `@pos/<scope>` | `@pos/feature-orders` |
| Feature folders | `kebab-case` | `packages/features/payments` |
| React files | `PascalCase.tsx` for components (future), `camelCase.ts` for hooks/utils | `root-shell.tsx` |
| API route modules | Express `Router` per module | `ordersRouter` |
| DB (Prisma) | `snake_case` in DB, `camelCase` in client via `@map` (when models exist) | — |
| Env vars | `SCREAMING_SNAKE_CASE` | `DATABASE_URL` |

## Dependency rules

1. **`@pos/feature-*`**: May depend on `@pos/ui`, `@pos/contracts`, `@pos/api-client`, `@pos/realtime-client`, `@pos/offline-engine`. **Must not** import another `@pos/feature-*`.
2. **`@pos/ui`**: No feature imports; only shared primitives/tokens.
3. **`@pos/contracts`**: No React; no IO; types/schemas only.
4. **`@pos/api-client`**: HTTP transport + endpoint modules; depends on `contracts` only.
5. **`apps/web`**: Composes routers, providers, and shell; may import all features.
6. **`apps/api`**: Modules own `routes` → `services` → `repositories`; cross-cutting lives in `platform/`.
7. **`@pos/offline-engine`**: Local-first persistence (IndexedDB / SQLite DDL), outbox queue, sync coordinator, connectivity probes, printer ports; **no React**.

## State management (frontend)

| Location | Responsibility |
|----------|------------------|
| `apps/web/src/state/query` | TanStack Query defaults, global query key factories (optional). |
| `apps/web/src/state/stores` | Cross-feature Zustand stores (session, device, layout, **connectivity**) — keep minimal. |
| `apps/web/src/state/slices` | Optional split store slices if a store grows. |
| `packages/features/*/src/queries` | Feature-scoped query hooks & keys. |
| `packages/features/*/src/stores` | Feature-local UI / ephemeral state. |

Server state lives in **React Query**; Zustand is for **UI/session/device** only.

## API layer

- **Version prefix**: `/api/v1`.
- **Registration**: `apps/api/src/platform/http/register-routes.ts` mounts module routers only (composition root).
- **Per module**: `routes/` (HTTP), `dto/` (Zod/input), `services/` (use-cases), `repositories/` (Prisma/data access), `sockets/` (Socket.IO handlers when added).

## Offline-first

- **`@pos/offline-engine`**: Outbox, sync cursors, storage adapters — no React.
- **Features**: Use narrow hooks from `offline-engine` via facades defined in `feature-*/lib` (future) to avoid coupling UI to storage.

## Tauri

- **`apps/tauri-pos`**: Wraps the Vite build from `@pos/web`; native capabilities (printer, secure storage) are added later via Tauri plugins and commands under `src-tauri/`.
