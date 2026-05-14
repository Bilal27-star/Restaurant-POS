import { Router } from "express";

import type { Env } from "../../config/env.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import { createRequireAuth, createRequirePermission } from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { TablesController } from "./tables.controller.js";
import { TablesRepository } from "./tables.repository.js";
import { TablesService } from "./tables.service.js";
import {
  createFloorBody,
  createTableBody,
  floorIdParams,
  patchFloorBody,
  patchTableBody,
  tableIdParams,
} from "./tables.validation.js";

export function createTablesRouter(_env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(_env);
  const requireTablesRead = createRequirePermission(PermissionCodes.TABLES_MANAGE);
  const requireTablesWrite = createRequirePermission(PermissionCodes.TABLES_MANAGE);

  const repo = new TablesRepository();
  const service = new TablesService(repo);
  const controller = new TablesController(service);

  router.get("/layout", requireAuth, requireTablesRead, controller.layout);
  router.get("/", requireAuth, requireTablesRead, controller.listTables);
  router.get("/:tableId", requireAuth, requireTablesRead, validateRequest("params", tableIdParams), controller.getTableById);

  router.post("/floors", requireAuth, requireTablesWrite, validateRequest("body", createFloorBody), controller.createFloor);

  router.patch(
    "/floors/:floorId",
    requireAuth,
    requireTablesWrite,
    validateRequest("params", floorIdParams),
    validateRequest("body", patchFloorBody),
    controller.patchFloor,
  );

  router.delete(
    "/floors/:floorId",
    requireAuth,
    requireTablesWrite,
    validateRequest("params", floorIdParams),
    controller.deleteFloor,
  );

  router.post("/", requireAuth, requireTablesWrite, validateRequest("body", createTableBody), controller.createTable);

  router.patch(
    "/:tableId",
    requireAuth,
    requireTablesWrite,
    validateRequest("params", tableIdParams),
    validateRequest("body", patchTableBody),
    controller.patchTable,
  );

  router.delete(
    "/:tableId",
    requireAuth,
    requireTablesWrite,
    validateRequest("params", tableIdParams),
    controller.deleteTable,
  );

  return router;
}
