import { Router } from "express";

import type { Env } from "../../config/env.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import { createRequireActiveSession, createRequireAuth, createRequirePermission } from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { ExpensesController } from "./expenses.controller.js";
import { ExpensesRepository } from "./expenses.repository.js";
import { ExpensesService } from "./expenses.service.js";
import { createExpenseBody, listExpensesQuery } from "./expenses.validation.js";
import { ShiftsRepository } from "../shifts/shifts.repository.js";

export function createExpensesRouter(_env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(_env);
  const requireExpenses = createRequirePermission(PermissionCodes.EXPENSES_MANAGE);
  const requireActiveSession = createRequireActiveSession();

  const expensesRepo = new ExpensesRepository();
  const shiftsRepo = new ShiftsRepository();
  const service = new ExpensesService(expensesRepo, shiftsRepo);
  const controller = new ExpensesController(service);

  router.get("/categories", requireAuth, requireExpenses, controller.categories);
  router.get("/", requireAuth, requireExpenses, validateRequest("query", listExpensesQuery), controller.list);
  router.post("/", requireAuth, requireActiveSession, requireExpenses, validateRequest("body", createExpenseBody), controller.create);

  return router;
}
