import { Router } from "express";

import type { Env } from "../../config/env.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import {
  createRequireActiveSession,
  createRequireAnyPermission,
  createRequireAuth,
  createRequirePermission,
} from "../../middleware/requireAuth.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsDataManagementService } from "./settings-data-management.service.js";
import { SettingsRepository } from "./settings.repository.js";
import { SettingsService } from "./settings.service.js";
import { patchSystemSettingsBody, restoreBackupBody } from "./settings.validation.js";

export function createSettingsRouter(_env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(_env);
  const requireSettingsRead = createRequireAnyPermission(PermissionCodes.SETTINGS_READ, PermissionCodes.SETTINGS_MANAGE);
  const requireSettingsManage = createRequirePermission(PermissionCodes.SETTINGS_MANAGE);
  const requireActiveSession = createRequireActiveSession();

  const repo = new SettingsRepository();
  const service = new SettingsService(repo);
  const dataManagement = new SettingsDataManagementService();
  const controller = new SettingsController(service, dataManagement);

  router.get("/system", requireAuth, requireSettingsRead, controller.getSystem);
  router.patch(
    "/system",
    requireAuth,
    requireActiveSession,
    requireSettingsManage,
    validateRequest("body", patchSystemSettingsBody),
    controller.patchSystem,
  );

  router.get("/backup", requireAuth, requireActiveSession, requireSettingsManage, controller.exportBackup);
  router.post(
    "/restore",
    requireAuth,
    requireActiveSession,
    requireSettingsManage,
    validateRequest("body", restoreBackupBody),
    controller.restoreBackup,
  );
  router.post(
    "/clear-data",
    requireAuth,
    requireActiveSession,
    requireSettingsManage,
    controller.clearOperationalData,
  );

  return router;
}
