import { Router } from "express";

import type { Env } from "../../config/env.js";
import { PermissionCodes } from "../../core/auth/permission-codes.js";
import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import { createRequireAuth, createRequirePermission } from "../../middleware/requireAuth.js";
import { prisma } from "../../prisma/index.js";
import { validateRequest } from "../../validators/validateRequest.js";
import { UsersRepository } from "./users.repository.js";
import { UsersService } from "./users.service.js";
import { UsersController } from "./users.controller.js";
import { createUserBody, patchUserBody, userIdParams } from "./users.validation.js";

export function createUsersRouter(env: Env): Router {
  const router = Router();
  const requireAuth = createRequireAuth(env);
  const requireUsersRead = createRequirePermission(PermissionCodes.USERS_READ);
  const requireUsersManage = createRequirePermission(PermissionCodes.USERS_MANAGE);

  const repo = new UsersRepository();
  const service = new UsersService(repo, env);
  const controller = new UsersController(service);

  router.get(
    "/me",
    requireAuth,
    requireUsersRead,
    asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        {
          userId: req.auth!.userId,
          restaurantId: req.auth!.restaurantId,
          roles: req.auth!.roles,
          permissions: req.auth!.permissions,
        },
        { message: "Current user context", status: 200 },
      );
    }),
  );

  router.get(
    "/",
    requireAuth,
    requireUsersRead,
    asyncHandler(async (req, res) => {
      const rid = req.auth!.restaurantId;
      const users = await prisma.user.findMany({
        where: { restaurantId: rid, deletedAt: null },
        select: {
          id: true,
          fullName: true,
          username: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          roles: { include: { role: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { fullName: "asc" },
      });
      sendSuccess(res, users, { message: "OK" });
    }),
  );

  router.post("/", requireAuth, requireUsersManage, validateRequest("body", createUserBody), controller.create);
  router.patch(
    "/:userId",
    requireAuth,
    requireUsersManage,
    validateRequest("params", userIdParams),
    validateRequest("body", patchUserBody),
    controller.patch,
  );
  router.delete("/:userId", requireAuth, requireUsersManage, validateRequest("params", userIdParams), controller.delete);

  return router;
}
