import { Router } from "express";

import type { Env } from "../../config/env.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import { createRequireActiveSession, createRequireAuth, createRequirePermission } from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { MenuController } from "./menu.controller.js";
import { MenuRepository } from "./menu.repository.js";
import { MenuService } from "./menu.service.js";
import {
  categoryIdParams,
  createCategoryBody,
  createItemBody,
  itemIdParams,
  patchCategoryBody,
  patchItemBody,
} from "./menu.validation.js";

export function createMenuRouter(_env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(_env);
  const requireActiveSession = createRequireActiveSession();
  const requireMenuRead = createRequirePermission(PermissionCodes.MENU_READ);
  const requireMenuManage = createRequirePermission(PermissionCodes.MENU_MANAGE);

  const repo = new MenuRepository();
  const service = new MenuService(repo);
  const controller = new MenuController(service);

  router.get("/categories", requireAuth, requireMenuRead, controller.listCategories);

  router.get("/items", requireAuth, requireMenuRead, controller.listItems);

  router.get("/items/:itemId", requireAuth, requireMenuRead, validateRequest("params", itemIdParams), controller.getItemById);

  router.get("/catalog", requireAuth, requireMenuRead, controller.catalog);

  router.post("/categories", requireAuth, requireActiveSession, requireMenuManage, validateRequest("body", createCategoryBody), controller.createCategory);

  router.patch(
    "/categories/:categoryId",
    requireAuth,
    requireActiveSession,
    requireMenuManage,
    validateRequest("params", categoryIdParams),
    validateRequest("body", patchCategoryBody),
    controller.patchCategory,
  );

  router.delete(
    "/categories/:categoryId",
    requireAuth,
    requireActiveSession,
    requireMenuManage,
    validateRequest("params", categoryIdParams),
    controller.deleteCategory,
  );

  router.post("/items", requireAuth, requireActiveSession, requireMenuManage, validateRequest("body", createItemBody), controller.createItem);

  router.patch(
    "/items/:itemId",
    requireAuth,
    requireActiveSession,
    requireMenuManage,
    validateRequest("params", itemIdParams),
    validateRequest("body", patchItemBody),
    controller.patchItem,
  );

  router.delete(
    "/items/:itemId",
    requireAuth,
    requireActiveSession,
    requireMenuManage,
    validateRequest("params", itemIdParams),
    controller.deleteItem,
  );
  router.post("/categories/reorder", requireAuth, requireActiveSession, requireMenuManage, controller.reorderCategories);
  router.post("/items/reorder", requireAuth, requireActiveSession, requireMenuManage, controller.reorderItems);

  return router;
}
