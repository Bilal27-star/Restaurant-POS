import { prisma } from "../../prisma/index.js";
import type { Prisma } from "@prisma/client";

export class CustomersRepository {
  findMany(restaurantId: string, where: Prisma.CustomerWhereInput = {}) {
    return prisma.customer.findMany({
      where: { ...where, restaurantId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  }

  findFirst(restaurantId: string, where: Prisma.CustomerWhereInput) {
    return prisma.customer.findFirst({
      where: { ...where, restaurantId, deletedAt: null },
    });
  }

  create(restaurantId: string, data: Omit<Prisma.CustomerUncheckedCreateInput, "restaurantId">) {
    return prisma.customer.create({
      data: { ...data, restaurantId },
    });
  }

  update(restaurantId: string, id: string, data: Prisma.CustomerUpdateInput) {
    return prisma.customer.updateMany({
      where: { id, restaurantId, deletedAt: null },
      data,
    });
  }

  search(restaurantId: string, query: string) {
    return prisma.customer.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 10,
    });
  }
}
