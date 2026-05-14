import type { Env } from "../../config/env.js";
import { UsersRepository } from "./users.repository.js";
import { hashPassword } from "../../utils/password.js";

export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly env: Env,
  ) {}

  async createUser(restaurantId: string, input: {
    fullName: string;
    username: string;
    phone?: string;
    email?: string;
    role: "ADMIN" | "MANAGER" | "CASHIER" | "WAITER";
    status?: "ACTIVE" | "INVITED" | "SUSPENDED" | "VACATION" | "DEACTIVATED";
  }) {
    const defaultPassword = "password123";
    const hashedPassword = await hashPassword(defaultPassword, this.env);
    
    return this.repository.createUser(
      {
        restaurantId,
        fullName: input.fullName,
        username: input.username,
        phone: input.phone,
        email: input.email,
        hashedPassword,
        status: input.status ?? "ACTIVE",
      },
      input.role,
    );
  }

  async patchUser(restaurantId: string, userId: string, input: {
    fullName?: string;
    username?: string;
    phone?: string;
    email?: string;
    role?: "ADMIN" | "MANAGER" | "CASHIER" | "WAITER";
    status?: "ACTIVE" | "INVITED" | "SUSPENDED" | "VACATION" | "DEACTIVATED";
  }) {
    const dataToUpdate: any = {};
    if (input.fullName) dataToUpdate.fullName = input.fullName;
    if (input.username) dataToUpdate.username = input.username;
    if (input.phone) dataToUpdate.phone = input.phone;
    if (input.email) dataToUpdate.email = input.email;
    if (input.status) dataToUpdate.status = input.status;

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
