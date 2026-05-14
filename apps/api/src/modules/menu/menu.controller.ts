import type { Request, Response } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import { auditFromRequest } from "../audit/security-audit.service.js";
import type { MenuService } from "./menu.service.js";

export class MenuController {
  constructor(private readonly service: MenuService) {}

  catalog = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.catalog(rid);
    sendSuccess(res, data, { message: "OK" });
  });

  listCategories = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.listCategories(rid);
    sendSuccess(res, data, { message: "OK" });
  });

  listItems = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.listItems(rid);
    sendSuccess(res, data, { message: "OK" });
  });

  getItemById = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { itemId } = req.params as { itemId: string };
    const data = await this.service.getItemById(rid, itemId);
    sendSuccess(res, data, { message: "OK" });
  });

  createCategory = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const body = req.body as { name: string; sortOrder?: number; colorToken?: string | null; iconKey?: string | null };
    const data = await this.service.createCategory(rid, body);
    auditFromRequest(req, {
      action: "menu.category.create",
      resourceType: "menu_category",
      metadataJson: { name: body.name },
    });
    sendSuccess(res, data, { message: "Category created", status: 201 });
  });

  patchCategory = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { categoryId } = req.params as { categoryId: string };
    const body = req.body as { name?: string; sortOrder?: number };
    const data = await this.service.patchCategory(rid, categoryId, body);
    auditFromRequest(req, {
      action: "menu.category.patch",
      resourceType: "menu_category",
      resourceId: categoryId,
      metadataJson: body,
    });
    sendSuccess(res, data, { message: "Category updated" });
  });

  deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { categoryId } = req.params as { categoryId: string };
    const data = await this.service.deleteCategory(rid, categoryId);
    auditFromRequest(req, {
      action: "menu.category.delete",
      resourceType: "menu_category",
      resourceId: categoryId,
    });
    sendSuccess(res, data, { message: "Category deleted" });
  });

  createItem = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const body = req.body as {
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
    };
    const data = await this.service.createItem(rid, body);
    auditFromRequest(req, {
      action: "menu.item.create",
      resourceType: "menu_item",
      metadataJson: { categoryId: body.categoryId, name: body.name },
    });
    sendSuccess(res, data, { message: "Item created", status: 201 });
  });

  patchItem = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { itemId } = req.params as { itemId: string };
    const body = req.body as {
      categoryId?: string;
      name?: string;
      description?: string | null;
      basePrice?: string;
      popular?: boolean;
      sortOrder?: number;
      imageUrl?: string | null;
      ingredients?: { name: string; removable?: boolean }[];
      modifiers?: { name: string; extraPrice: string }[];
    };
    const data = await this.service.patchItem(rid, itemId, body);
    auditFromRequest(req, {
      action: "menu.item.patch",
      resourceType: "menu_item",
      resourceId: itemId,
      metadataJson: body,
    });
    sendSuccess(res, data, { message: "Item updated" });
  });

  deleteItem = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const { itemId } = req.params as { itemId: string };
    const data = await this.service.deleteItem(rid, itemId);
    auditFromRequest(req, {
      action: "menu.item.delete",
      resourceType: "menu_item",
      resourceId: itemId,
    });
    sendSuccess(res, data, { message: "Item deleted" });
  });

  reorderCategories = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const body = req.body as { orders: { id: string; sortOrder: number }[] };
    const data = await this.service.reorderCategories(rid, body.orders);
    auditFromRequest(req, {
      action: "menu.categories.reorder",
      resourceType: "menu_category",
    });
    sendSuccess(res, data, { message: "Categories reordered" });
  });

  reorderItems = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const body = req.body as { orders: { id: string; sortOrder: number }[] };
    const data = await this.service.reorderItems(rid, body.orders);
    auditFromRequest(req, {
      action: "menu.items.reorder",
      resourceType: "menu_item",
    });
    sendSuccess(res, data, { message: "Items reordered" });
  });
}
