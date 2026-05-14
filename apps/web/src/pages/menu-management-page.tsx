import { FolderPlus, LayoutGrid, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { AddCategoryModal } from "@/components/menu/add-category-modal";
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
import type { PosCategory } from "@/components/pos/pos-demo-data";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useMenuCategoriesQuery, useMenuItemsQuery, useMenuMutations } from "@/hooks/use-menu-management-queries";

export function MenuManagementPage() {
  const { data: rawCategories = [], isLoading: isLoadingCategories } = useMenuCategoriesQuery();
  const { data: rawItems = [], isLoading: isLoadingItems } = useMenuItemsQuery();
  const { createCategory, patchCategory, deleteCategory, reorderCategories, createItem, patchItem, deleteItem } = useMenuMutations();

  const categories = useMemo(() => rawCategories as MenuCategory[], [rawCategories]);
  const items = useMemo(() => rawItems as MenuItem[], [rawItems]);

  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

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
      const isEdit = items.some((i) => i.id === payload.id);
      if (isEdit) {
        await patchItem.mutateAsync({ id: payload.id, body: payload });
      } else {
        await createItem.mutateAsync(payload);
      }
      showToast(isEdit ? fr.menuManagement.toastUpdated : fr.menuManagement.toastAdded);
    } catch (err: any) {
      showToast(err.message || "Failed to save item");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItemId) return;
    try {
      await deleteItem.mutateAsync(deleteItemId);
      setDeleteItemId(null);
      showToast(fr.menuManagement.toastRemoved);
    } catch (err: any) {
      showToast(err.message || "Failed to delete item");
    }
  };

  const handleAddCategory = async (cat: MenuCategory) => {
    try {
      await createCategory.mutateAsync(cat);
      setSelectedCategoryId(cat.id);
      showToast(fr.menuManagement.toastCategory);
    } catch (err: any) {
      showToast(err.message || "Failed to add category");
    }
  };

  const handleAvailability = async (itemId: string, available: boolean) => {
    try {
      await patchItem.mutateAsync({ id: itemId, body: { available } });
      showToast(fr.menuManagement.toastAvailability);
    } catch (err: any) {
      showToast(err.message || "Failed to update availability");
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
    } catch (err: any) {
      showToast(err.message || "Failed to reorder categories");
    }
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const selectedCategoryName = selectedCategory?.name ?? fr.menuManagement.categoryFallback;
  const SelectedCategoryIcon = selectedCategory
    ? getMenuCategoryLucideIcon(selectedCategory.iconId)
    : LayoutGrid;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[100] max-w-md -translate-x-1/2 rounded-xl border border-pos-border-subtle bg-pos-depth/95 px-4 py-3 text-center text-sm font-semibold text-foreground shadow-surface-lg ring-1 ring-black/[0.06] backdrop-blur-md"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      {(isLoadingCategories || isLoadingItems) && categories.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-pos-neon-magenta" />
        </div>
      ) : (
      <>
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
              <div className="mb-4 flex flex-wrap items-baseline gap-2">
                <div className="flex items-center gap-2">
                  <SelectedCategoryIcon className="h-7 w-7 text-pos-neon-magenta" aria-hidden />
                  <h2 className="text-xl font-bold tracking-tight text-pos-neon-magenta md:text-2xl">{selectedCategoryName}</h2>
                </div>
                <span className="text-base font-medium text-muted-foreground">({visibleItems.length})</span>
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
        onSave={(payload) => {
          handleSaveItem(payload);
          setEditItem(null);
        }}
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
      </>
      )}
    </div>
  );
}
