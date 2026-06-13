import { FolderPlus, LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AddCategoryModal } from "@/components/menu/add-category-modal";
import { KITCHEN_STATION_OPTIONS } from "@/components/menu/kitchen-station-options";
import { ConfirmDialog } from "@/components/menu/confirm-dialog";
import { ItemFormModal } from "@/components/menu/item-form-modal";
import { getMenuCategoryLucideIcon } from "@/components/menu/menu-category-icons";
import type {
  MenuCategory,
  MenuItem,
} from "@/components/menu/menu-types";
import { MenuItemCard } from "@/components/menu/menu-item-card";
import { fr } from "@/lib/locale/fr";
import { PosCategoryRail } from "@/components/pos/pos-category-rail";
import type { PosCategory } from "@/components/pos/pos-types";
import { cn } from "@/lib/utils";
import { PageQueryState } from "@/components/data/page-query-state";
import { PageShell } from "@/components/data/page-shell";
import { usePageRouteDiagnostics } from "@/hooks/use-page-route-diagnostics";
import {
  menuMutationErrorMessage,
  useMenuCategoriesQuery,
  useMenuItemsQuery,
  useMenuMutations,
} from "@/hooks/use-menu-management-queries";

export function MenuManagementPage() {
  usePageRouteDiagnostics("menu");
  const categoriesQuery = useMenuCategoriesQuery();
  const itemsQuery = useMenuItemsQuery();
  const { data: rawCategories, isLoading: isLoadingCategories, isError: categoriesError, error: categoriesErr } = categoriesQuery;
  const { data: rawItems, isLoading: isLoadingItems, isError: itemsError, error: itemsErr } = itemsQuery;
  const { createCategory, patchCategory, deleteCategory, reorderCategories, createItem, patchItem, deleteItem } =
    useMenuMutations();

  const categories = rawCategories ?? [];
  const items = rawItems ?? [];
  const hasMenuData = categories.length > 0 || items.length > 0;
  const menuLoading = (isLoadingCategories || isLoadingItems) && !hasMenuData;
  const menuError = (categoriesError || itemsError) && !hasMenuData;
  const menuErr = categoriesErr ?? itemsErr;
  const showDegradedBanner = (categoriesError || itemsError) && hasMenuData;

  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<MenuCategory | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const itemCountByCategory = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of categories) m[c.id] = 0;
    for (const it of items) {
      m[it.categoryId] = (m[it.categoryId] ?? 0) + 1;
    }
    return m;
  }, [categories, items]);

  const railCategories = useMemo<PosCategory[]>(
    () =>
      categories.map((c) => ({
        id: c.id,
        label: c.name,
        count: itemCountByCategory[c.id] ?? 0,
        icon: getMenuCategoryLucideIcon(c.iconId),
      })),
    [categories, itemCountByCategory],
  );

  const visibleItems = useMemo(
    () => items.filter((i) => i.categoryId === selectedCategoryId),
    [items, selectedCategoryId],
  );

  useEffect(() => {
    if (!categories.some((c) => c.id === selectedCategoryId) && categories[0]) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const handleSaveItem = async (payload: MenuItem) => {
    try {
      const isEdit = Boolean(payload.id) && items.some((i) => i.id === payload.id);
      if (isEdit) {
        await patchItem.mutateAsync({ id: payload.id, body: payload });
      } else {
        await createItem.mutateAsync(payload);
      }
      await Promise.all([categoriesQuery.refetch(), itemsQuery.refetch()]);
      showToast(isEdit ? fr.menuManagement.toastUpdated : fr.menuManagement.toastAdded);
    } catch (err) {
      showToast(menuMutationErrorMessage(err));
      throw err;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItemId) return;
    try {
      await deleteItem.mutateAsync(deleteItemId);
      setDeleteItemId(null);
      showToast(fr.menuManagement.toastRemoved);
    } catch (err) {
      showToast(menuMutationErrorMessage(err));
    }
  };

  const handleAddCategory = async (cat: MenuCategory) => {
    try {
      await createCategory.mutateAsync(cat);
      await itemsQuery.refetch();
      const { data: fresh } = await categoriesQuery.refetch();
      const created = fresh?.find((c) => c.name === cat.name);
      if (created) setSelectedCategoryId(created.id);
      showToast(fr.menuManagement.toastCategory);
    } catch (err) {
      showToast(menuMutationErrorMessage(err));
      throw err;
    }
  };

  const handleEditCategory = async (cat: MenuCategory) => {
    try {
      await patchCategory.mutateAsync({ id: cat.id, cat });
      await Promise.all([categoriesQuery.refetch(), itemsQuery.refetch()]);
      showToast(fr.menuManagement.toastCategoryUpdated);
    } catch (err) {
      showToast(menuMutationErrorMessage(err));
      throw err;
    }
  };

  const handleDeleteCategoryConfirm = async () => {
    if (!deleteCategoryId) return;
    try {
      await deleteCategory.mutateAsync(deleteCategoryId);
      setDeleteCategoryId(null);
      showToast(fr.menuManagement.toastRemoved);
    } catch (err) {
      showToast(menuMutationErrorMessage(err));
    }
  };

  const handleAvailability = async (itemId: string, available: boolean) => {
    try {
      await patchItem.mutateAsync({ id: itemId, body: { available } });
      showToast(fr.menuManagement.toastAvailability);
    } catch (err) {
      showToast(menuMutationErrorMessage(err));
    }
  };

  const handleMoveCategory = async (id: string, direction: "up" | "down") => {
    const idx = categories.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= categories.length) return;

    const newCategories = [...categories];
    const [moved] = newCategories.splice(idx, 1);
    newCategories.splice(newIdx, 0, moved);

    const orders = newCategories.map((c, i) => ({ id: c.id, sortOrder: i }));
    try {
      await reorderCategories.mutateAsync(orders);
      showToast("Ordre des catégories mis à jour");
    } catch (err) {
      showToast(menuMutationErrorMessage(err));
    }
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const selectedCategoryName = selectedCategory?.name ?? fr.menuManagement.categoryFallback;
  const selectedKitchenStationLabel =
    KITCHEN_STATION_OPTIONS.find((o) => o.id === selectedCategory?.kitchenStation)?.label ??
    fr.menuManagement.kitchenStationLabel;
  const SelectedCategoryIcon = selectedCategory
    ? getMenuCategoryLucideIcon(selectedCategory.iconId)
    : LayoutGrid;

  return (
    <PageShell fill>
    <PageQueryState
      label="le menu"
      isLoading={menuLoading}
      isError={menuError}
      error={menuErr}
      isEmpty={false}
      onRetry={() => {
        void categoriesQuery.refetch();
        void itemsQuery.refetch();
      }}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent"
      showLoadingOverlay={(isLoadingCategories || isLoadingItems) && hasMenuData}
    >
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      {showDegradedBanner ? (
        <div
          className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-100"
          role="status"
        >
          <span>{fr.dashboard.dashboardLoadError}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg"
            onClick={() => {
              void categoriesQuery.refetch();
              void itemsQuery.refetch();
            }}
          >
            {fr.dashboard.retry}
          </Button>
        </div>
      ) : null}
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[100] max-w-md -translate-x-1/2 rounded-xl border border-pos-border-subtle bg-pos-depth/95 px-4 py-3 text-center text-sm font-semibold text-foreground shadow-surface-lg ring-1 ring-black/[0.06] backdrop-blur-md"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            "flex shrink-0 flex-col gap-3 border-b border-pos-border-subtle bg-pos-depth/40 px-4 py-3 backdrop-blur-md md:px-6",
            "md:flex-row md:items-center md:justify-between",
          )}
        >
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">{fr.menuManagement.title}</h1>
            <p className="text-sm font-medium text-muted-foreground">{fr.menuManagement.subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 gap-2 rounded-lg border border-pos-border-subtle bg-pos-glass px-3 text-sm font-medium text-muted-foreground shadow-sm transition hover:border-pos-violet-glow hover:text-foreground"
              onClick={() => setAddCategoryOpen(true)}
            >
              <FolderPlus className="size-4 text-pos-neon-amber" aria-hidden />
              {fr.menuManagement.addCategory}
            </Button>
            <Button
              type="button"
              className="h-11 shrink-0 gap-2 rounded-[14px] border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] px-4 font-semibold text-white shadow-indigo-900/15 hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-surface-md"
              onClick={() => setAddItemOpen(true)}
            >
              <Plus className="size-4" aria-hidden />
              {fr.menuManagement.addItem}
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <PosCategoryRail
            categories={railCategories}
            activeId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            onMoveUp={(id) => handleMoveCategory(id, "up")}
            onMoveDown={(id) => handleMoveCategory(id, "down")}
            className="shrink-0 xl:min-h-0"
          />

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto xl:border-r xl:border-pos-border-subtle">
            <div className="px-4 py-4 md:px-6 md:py-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <div className="flex items-center gap-2">
                    <SelectedCategoryIcon className="h-7 w-7 text-pos-neon-magenta" aria-hidden />
                    <h2 className="text-xl font-bold tracking-tight text-pos-neon-magenta md:text-2xl">{selectedCategoryName}</h2>
                  </div>
                  <span className="text-base font-medium text-muted-foreground">({visibleItems.length})</span>
                  {selectedCategory ? (
                    <span className="rounded-lg border border-pos-border-subtle bg-pos-glass px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {fr.menuManagement.kitchenStationLabel}: {selectedKitchenStationLabel}
                    </span>
                  ) : null}
                </div>
                {selectedCategoryId && selectedCategory ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 rounded-lg border-pos-border-subtle"
                      onClick={() => setEditCategory(selectedCategory)}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      {fr.menuManagement.editCategory}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 rounded-lg border-rose-500/30 text-rose-300 hover:bg-rose-950/40"
                      onClick={() => setDeleteCategoryId(selectedCategoryId)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {fr.menuManagement.deleteConfirm}
                    </Button>
                  </div>
                ) : null}
              </div>

              {visibleItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-pos-border-subtle bg-pos-glass px-6 py-14 text-center shadow-surface-sm ring-1 ring-black/[0.03]">
                  <p className="text-sm font-semibold text-foreground">{fr.menuManagement.emptyTitle}</p>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">{fr.menuManagement.emptyHint}</p>
                  <Button
                    type="button"
                    className="mt-6 h-11 gap-2 rounded-[14px] border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] px-5 font-semibold text-white shadow-indigo-900/15 hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-surface-md"
                    onClick={() => setAddItemOpen(true)}
                  >
                    <Plus className="size-4" aria-hidden />
                    {fr.menuManagement.addItem}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
                  {visibleItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onEdit={() => setEditItem(item)}
                      onDelete={() => setDeleteItemId(item.id)}
                      onAvailabilityChange={(available) => handleAvailability(item.id, available)}
                      className="min-h-[148px]"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AddCategoryModal open={addCategoryOpen} onOpenChange={setAddCategoryOpen} onSave={handleAddCategory} />

      <AddCategoryModal
        open={editCategory != null}
        onOpenChange={(o) => {
          if (!o) setEditCategory(null);
        }}
        mode="edit"
        category={editCategory}
        onSave={async (cat) => {
          await handleEditCategory(cat);
          setEditCategory(null);
        }}
      />

      <ItemFormModal
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        mode="add"
        categories={categories}
        item={null}
        defaultCategoryId={selectedCategoryId}
        onSave={handleSaveItem}
      />

      <ItemFormModal
        open={editItem != null}
        onOpenChange={(o) => {
          if (!o) setEditItem(null);
        }}
        mode="edit"
        categories={categories}
        item={editItem}
        defaultCategoryId={selectedCategoryId}
        onSave={async (payload) => {
          await handleSaveItem(payload);
          setEditItem(null);
        }}
      />

      <ConfirmDialog
        open={deleteCategoryId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteCategoryId(null);
        }}
        title={fr.menuManagement.deleteTitle}
        description="Les plats de cette catégorie seront aussi supprimés."
        confirmLabel={fr.menuManagement.deleteConfirm}
        destructive
        onConfirm={handleDeleteCategoryConfirm}
      />

      <ConfirmDialog
        open={deleteItemId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteItemId(null);
        }}
        title={fr.menuManagement.deleteTitle}
        description={fr.menuManagement.deleteDesc}
        confirmLabel={fr.menuManagement.deleteConfirm}
        destructive
        onConfirm={handleDeleteConfirm}
        />
    </div>
    </PageQueryState>
    </PageShell>
  );
}
