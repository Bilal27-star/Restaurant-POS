import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/auth-context";
import type { MenuCategory, MenuItem } from "@/components/menu/menu-types";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { getAppApi, resolvedApiOrigin } from "@/lib/app-api";
import { posQueryRetry } from "@/lib/pos/pos-query-retry";
import { queryKeys } from "@/lib/query-keys";
import { ApiClientError } from "@pos/api-client";

const MENU_ADMIN_STALE_MS = 60_000;

export function menuMutationErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    const payload = err.details as { message?: string; error?: { message?: string } } | undefined;
    return payload?.message ?? payload?.error?.message ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

function colorTokenFromCategoryTint(tint: string): string | null {
  if (tint.includes("orange")) return "orange";
  if (tint.includes("rose")) return "rose";
  if (tint.includes("sky")) return "sky";
  if (tint.includes("emerald")) return "emerald";
  if (tint.includes("violet")) return "violet";
  if (tint.includes("amber")) return "amber";
  if (tint.includes("indigo")) return "indigo";
  return null;
}

function mapIngredients(item: MenuItem) {
  return item.ingredients
    .map((ing) => ({
      name: typeof ing === "object" && ing && "name" in ing ? String((ing as { name: string }).name).trim() : "",
      removable:
        typeof ing === "object" && ing && "removable" in ing ? Boolean((ing as { removable: boolean }).removable) : true,
    }))
    .filter((ing) => ing.name.length > 0);
}

function mapModifiers(item: MenuItem) {
  return item.modifiers
    .map((mod) => ({
      name: mod.name.trim(),
      extraPrice: String(mod.priceDa),
    }))
    .filter((mod) => mod.name.length > 0);
}

/** Data URLs are not persisted; oversized strings can break saves. */
function sanitizeMenuItemImageForApi(image: string | undefined): string | null {
  const s = image?.trim();
  if (!s) return null;
  if (s.startsWith("data:")) return null;
  if (s.length > 480_000) return null;
  return s;
}

function menuItemToCreateBody(item: MenuItem) {
  const categoryId = item.categoryId?.trim();
  if (!categoryId) {
    throw new Error("Choisissez une catégorie avant d'enregistrer le plat.");
  }
  return {
    categoryId,
    name: item.name.trim(),
    description: item.description?.trim() || undefined,
    basePrice: String(item.priceDa),
    available: item.available,
    popular: item.popular,
    imageUrl: sanitizeMenuItemImageForApi(item.image),
    ingredients: mapIngredients(item),
    modifiers: mapModifiers(item),
  };
}

function menuItemToPatchBody(item: MenuItem) {
  return {
    categoryId: item.categoryId,
    name: item.name.trim(),
    description: item.description?.trim() ?? "",
    basePrice: String(item.priceDa),
    available: item.available,
    popular: item.popular,
    imageUrl: sanitizeMenuItemImageForApi(item.image),
    ingredients: mapIngredients(item),
    modifiers: mapModifiers(item),
  };
}

function mapCategories(raw: unknown): MenuCategory[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const c = row as Record<string, unknown>;
    return {
      id: String(c.id ?? ""),
      name: String(c.name ?? ""),
      iconId: (c.iconKey as MenuCategory["iconId"]) || "default",
      iconTint: String(c.colorToken ?? "from-blue-500 to-indigo-500"),
      description: "",
    };
  });
}

function mapItems(raw: unknown): MenuItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const i = row as Record<string, unknown>;
    const category = i.category as Record<string, unknown> | undefined;
    const ingredientsRaw = i.ingredients;
    const modifiersRaw = i.modifiers;
    return {
      id: String(i.id ?? ""),
      categoryId: String(category?.id ?? i.categoryId ?? ""),
      name: String(i.name ?? ""),
      priceDa: Number.parseFloat(String(i.basePrice ?? "0")) || 0,
      description: String(i.description ?? ""),
      available: typeof i.available === "boolean" ? i.available : true,
      popular: typeof i.popular === "boolean" ? i.popular : false,
      image: typeof i.imageUrl === "string" ? i.imageUrl : undefined,
      ingredients: Array.isArray(ingredientsRaw) ? ingredientsRaw : [],
      modifiers: Array.isArray(modifiersRaw)
        ? modifiersRaw.map((m) => {
            const mod = m as Record<string, unknown>;
            return {
              id: String(mod.id ?? ""),
              name: String(mod.name ?? ""),
              priceDa: Number.parseFloat(String(mod.extraPrice ?? "0")) || 0,
            };
          })
        : [],
    };
  });
}

export function useMenuCategoriesQuery() {
  const { accessToken, ready } = useAuth();
  const enabled = ready && Boolean(accessToken);

  return useQuery({
    queryKey: queryKeys.menu.categories(),
    enabled,
    queryFn: async () => {
      const url = `${resolvedApiOrigin().replace(/\/$/, "")}/api/v1/menu/categories`;
      logDataFlow("menu_admin_categories_fetch_start", { url });
      try {
        const data = await getAppApi().menu.listCategories();
        const mapped = mapCategories(data);
        logDataFlow("menu_admin_categories_fetch_ok", { url, status: 200, count: mapped.length });
        return mapped;
      } catch (err) {
        const status = err instanceof ApiClientError ? err.status : 0;
        logDataFlow("menu_admin_categories_fetch_error", {
          url,
          status,
          throttled: status === 429,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    staleTime: MENU_ADMIN_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: posQueryRetry,
  });
}

export function useMenuItemsQuery() {
  const { accessToken, ready } = useAuth();
  const enabled = ready && Boolean(accessToken);

  return useQuery({
    queryKey: queryKeys.menu.items(),
    enabled,
    queryFn: async () => {
      const url = `${resolvedApiOrigin().replace(/\/$/, "")}/api/v1/menu/items`;
      logDataFlow("menu_admin_items_fetch_start", { url });
      try {
        const data = await getAppApi().menu.listItems();
        const mapped = mapItems(data);
        logDataFlow("menu_admin_items_fetch_ok", { url, status: 200, count: mapped.length });
        return mapped;
      } catch (err) {
        const status = err instanceof ApiClientError ? err.status : 0;
        logDataFlow("menu_admin_items_fetch_error", {
          url,
          status,
          throttled: status === 429,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    staleTime: MENU_ADMIN_STALE_MS,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: posQueryRetry,
  });
}

export function useMenuMutations() {
  const qc = useQueryClient();

  const invalidateMenu = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.menu.categories() }),
      qc.invalidateQueries({ queryKey: queryKeys.menu.items() }),
      qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() }),
    ]);
    await Promise.all([
      qc.refetchQueries({ queryKey: queryKeys.menu.categories() }),
      qc.refetchQueries({ queryKey: queryKeys.menu.items() }),
      qc.refetchQueries({ queryKey: queryKeys.menu.catalog() }),
    ]);
  };

  const createCategory = useMutation({
    mutationFn: (cat: MenuCategory) =>
      getAppApi().menu.createCategory({
        name: cat.name,
        iconKey: cat.iconId !== "default" ? cat.iconId : null,
        colorToken: colorTokenFromCategoryTint(cat.iconTint),
      }),
    onSuccess: async () => {
      await invalidateMenu();
    },
  });

  const patchCategory = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      getAppApi().menu.patchCategory(id, body),
    onSuccess: async () => {
      await invalidateMenu();
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => getAppApi().menu.deleteCategory(id),
    onSuccess: async () => {
      await invalidateMenu();
    },
  });

  const createItem = useMutation({
    mutationFn: async (item: MenuItem) => {
      console.info("[DISH CREATE START]", { name: item.name, categoryId: item.categoryId });
      try {
        const result = await getAppApi().menu.createItem(menuItemToCreateBody(item));
        console.info("[DISH CREATED]", { name: item.name });
        return result;
      } catch (e) {
        console.info("[DISH CREATE FAILED]", {
          name: item.name,
          message: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }
    },
    onSuccess: async () => {
      await invalidateMenu();
    },
  });

  const patchItem = useMutation({
    mutationFn: ({ id, body }: { id: string; body: MenuItem | Partial<MenuItem> }) => {
      if ("categoryId" in body && "name" in body && "priceDa" in body) {
        return getAppApi().menu.patchItem(id, menuItemToPatchBody(body as MenuItem));
      }
      const patch: Record<string, unknown> = {};
      if (body.available !== undefined) patch.available = body.available;
      if (body.popular !== undefined) patch.popular = body.popular;
      if (body.priceDa !== undefined) patch.basePrice = String(body.priceDa);
      if (body.name !== undefined) patch.name = body.name;
      if (body.description !== undefined) patch.description = body.description;
      if (body.categoryId !== undefined) patch.categoryId = body.categoryId;
      if (body.image !== undefined) patch.imageUrl = sanitizeMenuItemImageForApi(body.image as string | undefined);
      return getAppApi().menu.patchItem(id, patch);
    },
    onSuccess: async () => {
      await invalidateMenu();
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => getAppApi().menu.deleteItem(id),
    onSuccess: async () => {
      await invalidateMenu();
    },
  });

  const reorderCategories = useMutation({
    mutationFn: (orders: { id: string; sortOrder: number }[]) => getAppApi().menu.reorderCategories(orders),
    onSuccess: async () => {
      await invalidateMenu();
    },
  });

  const reorderItems = useMutation({
    mutationFn: (orders: { id: string; sortOrder: number }[]) => getAppApi().menu.reorderItems(orders),
    onSuccess: async () => {
      await invalidateMenu();
    },
  });

  return {
    createCategory,
    patchCategory,
    deleteCategory,
    reorderCategories,
    createItem,
    patchItem,
    deleteItem,
    reorderItems,
  };
}
