import type { RequestHandler } from "express";
import { Router } from "express";

import type { Env } from "../../config/env.js";
import { createAnalyticsRouter } from "../../modules/analytics/analytics.routes.js";
import { createAuthRouter } from "../../modules/auth/auth.routes.js";
import { customersRoutes } from "../../modules/customers/customers.routes.js";
import { createExpensesRouter } from "../../modules/expenses/expenses.routes.js";
import { createMenuRouter } from "../../modules/menu/index.js";
import { createOrdersRouter } from "../../modules/orders/orders.routes.js";
import { createPaymentsRouter } from "../../modules/payments/payments.routes.js";
import { createPrintingRouter } from "../../modules/printing/printing.routes.js";
import { rolesRoutes } from "../../modules/roles/roles.routes.js";
import { createSettingsRouter } from "../../modules/settings/settings.routes.js";
import { createShiftsRouter } from "../../modules/shifts/shifts.routes.js";
import { createNavigationRouter } from "../../modules/navigation/navigation.routes.js";
import { createTablesRouter } from "../../modules/tables/tables.routes.js";
import { createUsersRouter } from "../../modules/users/users.routes.js";

export type V1RouterDeps = {
  env: Env;
  authLimiter: RequestHandler;
};

export function buildV1Router(deps: V1RouterDeps): Router {
  const router = Router();

  router.use("/auth", deps.authLimiter, createAuthRouter(deps.env));
  router.use("/navigation", createNavigationRouter(deps.env));
  router.use("/users", createUsersRouter(deps.env));
  router.use("/roles", rolesRoutes);
  router.use("/tables", createTablesRouter(deps.env));
  router.use("/menu", createMenuRouter(deps.env));
  router.use("/orders", createOrdersRouter(deps.env));
  router.use("/payments", createPaymentsRouter(deps.env));
  router.use("/print", createPrintingRouter(deps.env));
  router.use("/shifts", createShiftsRouter(deps.env));
  router.use("/expenses", createExpensesRouter(deps.env));
  router.use("/analytics", createAnalyticsRouter(deps.env));
  router.use("/settings", createSettingsRouter(deps.env));
  router.use("/customers", customersRoutes);

  return router;
}
