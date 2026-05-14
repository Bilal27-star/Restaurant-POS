import type { Request, Response } from "express";
import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import type { UsersService } from "./users.service.js";

/** HTTP adapter for users. */
export class UsersController {
  constructor(private readonly service: UsersService) {}

  create = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const body = req.body as {
      fullName: string;
      username: string;
      phone?: string;
      email?: string;
      role: "ADMIN" | "MANAGER" | "CASHIER" | "WAITER";
      status?: "ACTIVE" | "INVITED" | "SUSPENDED" | "VACATION" | "DEACTIVATED";
    };
    const data = await this.service.createUser(auth.restaurantId, body);
    sendSuccess(res, data, { message: "User created", status: 201 });
  });

  patch = asyncHandler(async (req: Request, res: Response) => {
    const auth = req.auth!;
    const { userId } = req.params as { userId: string };
    const body = req.body as {
      fullName?: string;
      username?: string;
      phone?: string;
      email?: string;
      role?: "ADMIN" | "MANAGER" | "CASHIER" | "WAITER";
      status?: "ACTIVE" | "INVITED" | "SUSPENDED" | "VACATION" | "DEACTIVATED";
    };
    await this.service.patchUser(auth.restaurantId, userId, body);
    sendSuccess(res, { success: true }, { message: "User updated" });
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params as { userId: string };
    await this.service.deleteUser(userId);
    sendSuccess(res, { success: true }, { message: "User deleted" });
  });
}
