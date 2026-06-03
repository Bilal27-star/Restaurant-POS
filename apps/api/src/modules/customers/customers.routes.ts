import { Router } from "express";

import type { Env } from "../../config/env.js";
import { createRequireAuth } from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { CustomersController } from "./customers.controller.js";
import { CustomersRepository } from "./customers.repository.js";
import { CustomersService } from "./customers.service.js";
import { customerSearchQuery, upsertCustomerBody } from "./customers.validation.js";

export function createCustomersRouter(env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(env);

  const repo = new CustomersRepository();
  const service = new CustomersService(repo);
  const controller = new CustomersController(service);

  router.get("/", requireAuth, controller.list);
  router.get("/search", requireAuth, validateRequest("query", customerSearchQuery), controller.search);
  router.post("/", requireAuth, validateRequest("body", upsertCustomerBody), controller.upsert);

  return router;
}
