import type { Prisma } from "@prisma/client";

import type { Env } from "../../config/env.js";
import { UsersRepository } from "./users.repository.js";
import { hashPassword } from "../../utils/password.js";

export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly env: Env,
  ) {}

  async createUser(
    restaurantId: string,
    input: {
      fullName: string;
      username: string;
      password: string;
      phone?: string;
      email?: string;
      role: "ADMIN" | "MANAGER" | "CASHIER" | "WAITER";
      status?: "ACTIVE" | "INVITED" | "SUSPENDED" | "VACATION" | "DEACTIVATED";
    },
  ) {
    const hashedPassword = await hashPassword(input.password, this.env);

    const user = await this.repository.createUser(
      {
        restaurantId,
        fullName: input.fullName,
        username: input.username,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        hashedPassword,
        status: input.status ?? "ACTIVE",
      },
      input.role,
    );
    console.info("[USER CREATED]", { restaurantId, userId: user.id, username: user.username });
    return user;
  }

  async patchUser(
    restaurantId: string,
    userId: string,
    input: {
      fullName?: string;
      username?: string;
      password?: string;
      phone?: string;
      email?: string;
      role?: "ADMIN" | "MANAGER" | "CASHIER" | "WAITER";
      status?: "ACTIVE" | "INVITED" | "SUSPENDED" | "VACATION" | "DEACTIVATED";
    },
  ) {
    const dataToUpdate: Prisma.UserUpdateInput = {};
    if (input.fullName !== undefined) dataToUpdate.fullName = input.fullName;
    if (input.username !== undefined) dataToUpdate.username = input.username;
    if (input.phone !== undefined) dataToUpdate.phone = input.phone.trim() || null;
    if (input.email !== undefined) dataToUpdate.email = input.email.trim() || null;
    if (input.status !== undefined) dataToUpdate.status = input.status;
    if (input.password !== undefined) {
      dataToUpdate.hashedPassword = await hashPassword(input.password, this.env);
    }

    if (Object.keys(dataToUpdate).length > 0) {
      await this.repository.updateUser(userId, dataToUpdate);
    }

    if (input.role) {
      await this.repository.updateRole(userId, input.role, restaurantId);
    }
  }

  async deleteUser(userId: string) {
    return this.repository.deleteUser(userId);
  }
}
