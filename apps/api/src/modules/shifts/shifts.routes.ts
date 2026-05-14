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
import { ShiftsController } from "./shifts.controller.js";
import { ShiftsRepository } from "./shifts.repository.js";
import { ShiftsService } from "./shifts.service.js";
import { closeShiftBody, openShiftBody, shiftIdParams } from "./shifts.validation.js";

export function createShiftsRouter(_env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(_env);
  const requireActiveSession = createRequireActiveSession();
  const requireShiftContext = createRequireAnyPermission(
    PermissionCodes.SHIFTS_READ,
    PermissionCodes.SHIFTS_OPEN,
    PermissionCodes.SHIFTS_CLOSE,
  );
  const requireShiftOpen = createRequirePermission(PermissionCodes.SHIFTS_OPEN);
  const requireShiftClose = createRequirePermission(PermissionCodes.SHIFTS_CLOSE);

  const repo = new ShiftsRepository();
  const service = new ShiftsService(repo);
  const controller = new ShiftsController(service);

  router.get("/current", requireAuth, requireShiftContext, controller.current);
  router.post(
    "/open",
    requireAuth,
    requireActiveSession,
    requireShiftOpen,
    validateRequest("body", openShiftBody),
    controller.open,
  );
  router.post(
    "/:shiftId/close",
    requireAuth,
    requireActiveSession,
    requireShiftClose,
    validateRequest("params", shiftIdParams),
    validateRequest("body", closeShiftBody),
    controller.close,
  );
  router.post(
    "/refunds",
    requireAuth,
    requireActiveSession,
    requireShiftContext,
    controller.refund,
  );

  return router;
}
