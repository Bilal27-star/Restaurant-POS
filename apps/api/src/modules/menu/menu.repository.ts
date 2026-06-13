import type { Prisma } from "@prisma/client";

import { prisma } from "../../prisma/index.js";

const catalogInclude = {
  items: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" as const },
    include: {
      ingredients: { orderBy: { sortOrder: "asc" as const } },
      modifiers: { orderBy: { sortOrder: "asc" as const } },
      menuItemModifiers: {
        orderBy: { sortOrder: "asc" as const },
        include: { modifier: true },
      },
    },
  },
} satisfies Prisma.MenuCategoryInclude;

export type MenuCatalogCategory = Prisma.MenuCategoryGetPayload<{ include: typeof catalogInclude }>;

export class MenuRepository {
  listCatalog(restaurantId: string): Promise<MenuCatalogCategory[]> {
    return prisma.menuCategory.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: catalogInclude,
    });
  }

  createCategory(
    restaurantId: string,
    input: {
      name: string;
      slug: string;
      sortOrder: number;
      colorToken?: string | null;
      iconKey?: string | null;
      kitchenStation?: Prisma.MenuCategoryCreateInput["kitchenStation"];
    },
  ) {
    return prisma.menuCategory.create({
      data: {
        restaurantId,
        name: input.name,
        slug: input.slug,
        sortOrder: input.sortOrder,
        colorToken: input.colorToken ?? null,
        iconKey: input.iconKey ?? null,
        kitchenStation: input.kitchenStation ?? null,
      },
    });
  }

  async updateCategory(restaurantId: string, categoryId: string, data: Prisma.MenuCategoryUpdateInput) {
    return prisma.menuCategory.updateMany({
      where: { id: categoryId, restaurantId, deletedAt: null },
      data,
    });
  }

  async softDeleteCategory(restaurantId: string, categoryId: string) {
    return prisma.$transaction(async (tx) => {
      const category = await tx.menuCategory.findFirst({
        where: { id: categoryId, restaurantId },
        select: { slug: true },
      });
      await tx.menuItem.updateMany({
        where: { restaurantId, categoryId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.menuCategory.updateMany({
        where: { id: categoryId, restaurantId },
        data: {
          deletedAt: new Date(),
          slug: category
            ? `${category.slug}-deleted-${Date.now()}`
            : `deleted-${categoryId}`,
        },
      });
    });
  }

  async createItem(input: {
    restaurantId: string;
    categoryId: string;
    name: string;
    description: string;
    basePrice: Prisma.Decimal;
    available: boolean;
    popular: boolean;
    sortOrder: number;
    imageUrl?: string | null;
    ingredients?: { name: string; removable?: boolean }[];
    modifiers?: { name: string; extraPrice: Prisma.Decimal }[];
  }) {
    return prisma.menuItem.create({
      data: {
        restaurantId: input.restaurantId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        basePrice: input.basePrice,
        available: input.available,
        popular: input.popular,
        sortOrder: input.sortOrder,
        imageUrl: input.imageUrl,
        ingredients: {
          create: input.ingredients?.map((ing, i) => ({
            name: ing.name,
            removable: ing.removable ?? true,
            sortOrder: i,
          })),
        },
        modifiers: {
          create: input.modifiers?.map((mod, i) => ({
            name: mod.name,
            extraPrice: mod.extraPrice,
            sortOrder: i,
          })),
        },
      },
    });
  }

  async updateItem(restaurantId: string, itemId: string, data: Prisma.MenuItemUpdateInput) {
    // If we want to support nested updates for ingredients/modifiers, we need to handle them carefully.
    // For now, let's assume we'll use find + update if needed, or Prisma's nested update if passed.
    return prisma.menuItem.update({
      where: { id: itemId, restaurantId, deletedAt: null },
      data,
    });
  }

  async softDeleteItem(restaurantId: string, itemId: string) {
    return prisma.menuItem.updateMany({
      where: { id: itemId, restaurantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  findCategory(restaurantId: string, categoryId: string) {
    return prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId, deletedAt: null },
      select: { id: true },
    });
  }

  findCategoryBySlug(restaurantId: string, slug: string) {
    return prisma.menuCategory.findFirst({
      where: { restaurantId, slug, deletedAt: null },
      select: { id: true },
    });
  }

  listCategorySummaries(restaurantId: string) {
    return prisma.menuCategory.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: { items: { where: { deletedAt: null } } },
        },
      },
    });
  }

  findMenuItemById(restaurantId: string, itemId: string) {
    return prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId, deletedAt: null },
      include: {
        category: true,
        ingredients: { orderBy: { sortOrder: "asc" } },
        modifiers: { orderBy: { sortOrder: "asc" } },
      },
    });
  }

  async updateCategorySortOrders(restaurantId: string, orders: { id: string; sortOrder: number }[]) {
    return prisma.$transaction(
      orders.map((o) =>
        prisma.menuCategory.updateMany({
          where: { id: o.id, restaurantId },
          data: { sortOrder: o.sortOrder },
        }),
      ),
    );
  }

  async updateItemSortOrders(restaurantId: string, orders: { id: string; sortOrder: number }[]) {
    return prisma.$transaction(
      orders.map((o) =>
        prisma.menuItem.updateMany({
          where: { id: o.id, restaurantId },
          data: { sortOrder: o.sortOrder },
        }),
      ),
    );
  }
}
