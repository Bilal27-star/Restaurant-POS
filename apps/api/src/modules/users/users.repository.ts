import { prisma } from "../../prisma/index.js";
import type { Prisma } from "@prisma/client";

export class UsersRepository {
  async createUser(data: Prisma.UserUncheckedCreateInput, roleCode: "ADMIN" | "MANAGER" | "CASHIER" | "WAITER") {
    // Find role
    const role = await prisma.role.findFirst({
      where: { code: roleCode, restaurantId: data.restaurantId },
    });
    if (!role) throw new Error("Role not found");

    return prisma.user.create({
      data: {
        ...data,
        roles: {
          create: {
            roleId: role.id,
          },
        },
      },
    });
  }

  async updateUser(userId: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async updateRole(userId: string, roleCode: "ADMIN" | "MANAGER" | "CASHIER" | "WAITER", restaurantId: string) {
    const role = await prisma.role.findFirst({
      where: { code: roleCode, restaurantId },
    });
    if (!role) throw new Error("Role not found");

    await prisma.userRole.deleteMany({
      where: { userId },
    });
    
    await prisma.userRole.create({
      data: {
        userId,
        roleId: role.id,
      },
    });
  }

  async deleteUser(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
  }
}
