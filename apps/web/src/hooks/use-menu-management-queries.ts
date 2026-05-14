import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAppApi } from "@/lib/app-api";
import { queryKeys } from "@/lib/query-keys";

export function useMenuCategoriesQuery() {
  return useQuery({
    queryKey: queryKeys.menu.categories(),
    queryFn: async () => {
      const data = await getAppApi().menu.listCategories();
      return (data as any[]).map(c => ({
        id: c.id,
        name: c.name,
        iconId: (c.iconKey as any) || "default",
        iconTint: c.colorToken || "from-blue-500 to-indigo-500",
        description: "",
      }));
    },
  });
}

export function useMenuItemsQuery() {
  return useQuery({
    queryKey: queryKeys.menu.items(),
    queryFn: async () => {
      const data = await getAppApi().menu.listItems();
      return (data as any[]).map(i => ({
        id: i.id,
        categoryId: i.category?.id || i.categoryId,
        name: i.name,
        priceDa: parseFloat(i.basePrice),
        description: i.description,
        available: i.available,
        popular: i.popular,
        imageUrl: i.imageUrl,
        ingredients: i.ingredients || [],
        modifiers: (i.modifiers || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          priceDa: parseFloat(m.extraPrice),
        })),
      }));
    },
  });
}

export function useMenuMutations() {
  const qc = useQueryClient();

  const createCategory = useMutation({
    mutationFn: (body: any) => getAppApi().menu.createCategory(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu.categories() });
      qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() });
    },
  });

  const patchCategory = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => getAppApi().menu.patchCategory(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu.categories() });
      qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => getAppApi().menu.deleteCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu.categories() });
      qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() });
    },
  });

  const createItem = useMutation({
    mutationFn: (item: any) => {
      const body = {
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        basePrice: String(item.priceDa),
        available: item.available,
        popular: item.popular,
        imageUrl: item.imageUrl,
        ingredients: item.ingredients.map((ing: any) => ({ name: ing.name, removable: ing.removable })),
        modifiers: item.modifiers.map((mod: any) => ({ name: mod.name, extraPrice: String(mod.priceDa) })),
      };
      return getAppApi().menu.createItem(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu.items() });
      qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() });
    },
  });

  const patchItem = useMutation({
    mutationFn: ({ id, body: item }: { id: string; body: any }) => {
      const payload: any = { ...item };
      if (item.priceDa !== undefined) payload.basePrice = String(item.priceDa);
      if (item.ingredients) payload.ingredients = item.ingredients.map((ing: any) => ({ name: ing.name, removable: ing.removable }));
      if (item.modifiers) payload.modifiers = item.modifiers.map((mod: any) => ({ name: mod.name, extraPrice: String(mod.priceDa) }));
      return getAppApi().menu.patchItem(id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu.items() });
      qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() });
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => getAppApi().menu.deleteItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu.items() });
      qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() });
    },
  });

  const reorderCategories = useMutation({
    mutationFn: (orders: { id: string; sortOrder: number }[]) => getAppApi().menu.reorderCategories(orders),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu.categories() });
      qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() });
    },
  });

  const reorderItems = useMutation({
    mutationFn: (orders: { id: string; sortOrder: number }[]) => getAppApi().menu.reorderItems(orders),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.menu.items() });
      qc.invalidateQueries({ queryKey: queryKeys.menu.catalog() });
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
