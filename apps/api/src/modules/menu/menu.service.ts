import { Prisma } from "@prisma/client";
import type { KitchenStation } from "@pos/database";

import { prisma } from "@pos/database";

import { ApiError } from "../../core/http/ApiError.js";
import { money } from "../../core/orders/money.js";
import { getRealtimeHub } from "../../realtime/registry.js";

import type { MenuCatalogCategory } from "./menu.repository.js";
import { MenuRepository } from "./menu.repository.js";
import type { MenuCategorySummaryDto, MenuItemPosDto } from "./menu.serializer.js";
import {
  serializeMenuItemFromCatalogRow,
  serializeMenuItemStandalone,
} from "./menu.serializer.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export class MenuService {
  constructor(private readonly repo: MenuRepository) {}

  async catalog(restaurantId: string): Promise<MenuCatalogCategory[]> {
    return this.repo.listCatalog(restaurantId);
  }

  async listCategories(restaurantId: string): Promise<MenuCategorySummaryDto[]> {
    const rows = await this.repo.listCategorySummaries(restaurantId);
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      sortOrder: c.sortOrder,
      colorToken: c.colorToken,
      iconKey: c.iconKey,
      kitchenStation: c.kitchenStation,
      itemCount: c._count.items,
    }));
  }

  async listItems(restaurantId: string): Promise<MenuItemPosDto[]> {
    const catalog = await this.repo.listCatalog(restaurantId);
    const out: MenuItemPosDto[] = [];
    for (const cat of catalog) {
      for (const item of cat.items) {
        out.push(serializeMenuItemFromCatalogRow(item, cat));
      }
    }
    return out;
  }

  async getItemById(restaurantId: string, itemId: string): Promise<MenuItemPosDto> {
    const row = await this.repo.findMenuItemById(restaurantId, itemId);
    if (!row) {
      throw ApiError.notFound("Menu item not found");
    }
    return serializeMenuItemStandalone(row);
  }

  async createCategory(
    restaurantId: string,
    input: {
      name: string;
      sortOrder?: number;
      colorToken?: string | null;
      iconKey?: string | null;
      kitchenStation?: KitchenStation | null;
    },
  ) {
    const base = slugify(input.name);
    let slug = base || "category";
    for (let i = 0; i < 20; i++) {
      const taken = await prisma.menuCategory.findFirst({
        where: { restaurantId, slug, deletedAt: null },
        select: { id: true },
      });
      if (!taken) break;
      slug = `${base || "category"}-${i + 2}`;
    }
    const created = await this.repo.createCategory(restaurantId, {
      name: input.name.trim(),
      slug,
      sortOrder: input.sortOrder ?? 0,
      colorToken: input.colorToken,
      iconKey: input.iconKey,
      kitchenStation: input.kitchenStation ?? null,
    });
    console.info("[CATEGORY CREATED]", {
      restaurantId,
      categoryId: created.id,
      name: created.name,
    });
    const catalog = await this.repo.listCatalog(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["menu"] });
    return catalog;
  }

  async patchCategory(
    restaurantId: string,
    categoryId: string,
    patch: {
      name?: string;
      sortOrder?: number;
      colorToken?: string | null;
      iconKey?: string | null;
      kitchenStation?: KitchenStation | null;
    },
  ) {
    const c = await this.repo.findCategory(restaurantId, categoryId);
    if (!c) {
      throw ApiError.notFound("Category not found");
    }
    const data: Prisma.MenuCategoryUpdateInput = {};
    if (patch.name !== undefined) {
      data.name = patch.name.trim();
    }
    if (patch.sortOrder !== undefined) {
      data.sortOrder = patch.sortOrder;
    }
    if (patch.colorToken !== undefined) {
      data.colorToken = patch.colorToken;
    }
    if (patch.iconKey !== undefined) {
      data.iconKey = patch.iconKey;
    }
    if (patch.kitchenStation !== undefined) {
      data.kitchenStation = patch.kitchenStation;
    }
    const n = await this.repo.updateCategory(restaurantId, categoryId, data);
    if (n.count === 0) {
      throw ApiError.notFound("Category not found");
    }
    const catalog = await this.repo.listCatalog(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["menu"] });
    return catalog;
  }

  async deleteCategory(restaurantId: string, categoryId: string) {
    const c = await this.repo.findCategory(restaurantId, categoryId);
    if (!c) {
      throw ApiError.notFound("Category not found");
    }
    await this.repo.softDeleteCategory(restaurantId, categoryId);
    const catalog = await this.repo.listCatalog(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["menu"] });
    return catalog;
  }

  async createItem(
    restaurantId: string,
    input: {
      categoryId: string;
      name: string;
      description?: string;
      basePrice: string;
      available?: boolean;
      popular?: boolean;
      sortOrder?: number;
      imageUrl?: string | null;
      ingredients?: { name: string; removable?: boolean }[];
      modifiers?: { name: string; extraPrice: string }[];
    },
  ) {
    console.info("[DISH CREATE START]", { restaurantId, categoryId: input.categoryId, name: input.name });
    try {
      const cat = await this.repo.findCategory(restaurantId, input.categoryId);
      if (!cat) {
        throw ApiError.badRequest("Category not found");
      }
      const price = money(input.basePrice);
      if (price.lt(money(0))) {
        throw ApiError.badRequest("Invalid price");
      }
      const createdItem = await this.repo.createItem({
        restaurantId,
        categoryId: input.categoryId,
        name: input.name.trim(),
        description: (input.description ?? "").trim(),
        basePrice: price,
        available: input.available ?? true,
        popular: input.popular ?? false,
        sortOrder: input.sortOrder ?? 0,
        imageUrl: input.imageUrl,
        ingredients: input.ingredients,
        modifiers: input.modifiers?.map((m) => ({ name: m.name, extraPrice: money(m.extraPrice) })),
      });
      console.info("[DISH CREATED]", {
        restaurantId,
        itemId: createdItem.id,
        categoryId: input.categoryId,
        name: createdItem.name,
      });
      const catalog = await this.repo.listCatalog(restaurantId);
      getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["menu"] });
      return catalog;
    } catch (e) {
      console.info("[DISH CREATE FAILED]", {
        restaurantId,
        categoryId: input.categoryId,
        name: input.name,
        message: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  }

  async patchItem(
    restaurantId: string,
    itemId: string,
    patch: {
      name?: string;
      description?: string | null;
      basePrice?: string;
      available?: boolean;
      popular?: boolean;
      sortOrder?: number;
      categoryId?: string;
      imageUrl?: string | null;
      ingredients?: { id?: string; name: string; removable?: boolean }[];
      modifiers?: { id?: string; name: string; extraPrice: string }[];
    },
  ) {
    const data: Prisma.MenuItemUpdateInput = {};
    if (patch.name !== undefined) {
      data.name = patch.name.trim();
    }
    if (patch.description !== undefined) {
      data.description = patch.description ?? "";
    }
    if (patch.imageUrl !== undefined) {
      data.imageUrl = patch.imageUrl;
    }
    if (patch.basePrice !== undefined) {
      const p = money(patch.basePrice);
      if (p.lt(money(0))) {
        throw ApiError.badRequest("Invalid price");
      }
      data.basePrice = p;
    }
    if (patch.available !== undefined) {
      data.available = patch.available;
    }
    if (patch.popular !== undefined) {
      data.popular = patch.popular;
    }
    if (patch.sortOrder !== undefined) {
      data.sortOrder = patch.sortOrder;
    }
    if (patch.ingredients !== undefined) {
      // Simplistic approach: delete all and recreate (Prisma `set` equivalent or `deleteMany` + `createMany`)
      data.ingredients = {
        deleteMany: {},
        create: patch.ingredients.map((ing, i) => ({
          name: ing.name,
          removable: ing.removable ?? true,
          sortOrder: i,
        })),
      };
    }
    if (patch.modifiers !== undefined) {
      data.modifiers = {
        deleteMany: {},
        create: patch.modifiers.map((mod, i) => ({
          name: mod.name,
          extraPrice: money(mod.extraPrice),
          sortOrder: i,
        })),
      };
    }
    if (patch.categoryId !== undefined) {
      const cat = await this.repo.findCategory(restaurantId, patch.categoryId);
      if (!cat) {
        throw ApiError.badRequest("Category not found");
      }
      data.category = { connect: { id: patch.categoryId } };
    }
    try {
      await this.repo.updateItem(restaurantId, itemId, data);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        throw ApiError.notFound("Menu item not found");
      }
      throw e;
    }
    const catalog = await this.repo.listCatalog(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["menu"] });
    return catalog;
  }

  async deleteItem(restaurantId: string, itemId: string) {
    const n = await this.repo.softDeleteItem(restaurantId, itemId);
    if (n.count === 0) {
      throw ApiError.notFound("Menu item not found");
    }
    const catalog = await this.repo.listCatalog(restaurantId);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["menu"] });
    return catalog;
  }

  async reorderCategories(restaurantId: string, orders: { id: string; sortOrder: number }[]) {
    await this.repo.updateCategorySortOrders(restaurantId, orders);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["menu"] });
    return this.repo.listCatalog(restaurantId);
  }

  async reorderItems(restaurantId: string, orders: { id: string; sortOrder: number }[]) {
    await this.repo.updateItemSortOrders(restaurantId, orders);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["menu"] });
    return this.repo.listCatalog(restaurantId);
  }
}
