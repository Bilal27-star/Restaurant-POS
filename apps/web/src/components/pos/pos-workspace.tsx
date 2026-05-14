import { getOrCreateDeviceId } from "@pos/offline-engine";
import { ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { useAuth } from "@/auth/auth-context";
import type { TakeawayCustomer } from "@/components/takeaway/takeaway-customer-types";
import type { TakeawayCustomerDraft, TakeawayCustomerFieldErrorKey } from "@/components/takeaway/takeaway-customer-validation";
import { validateTakeawayCustomerDraft } from "@/components/takeaway/takeaway-customer-validation";
import { cartLinesToTakeawayItems, buildTakeawayKitchenNotes } from "@/components/takeaway/takeaway-pos-bridge";
import { formatAlgeriaPhoneDisplay, phoneKey } from "@/components/takeaway/takeaway-phone-utils";
import { useTakeawayQueueStore } from "@/components/takeaway/takeaway-queue-store";
import { usePosMenuCategoriesQuery, usePosMenuItemsQuery } from "@/hooks/use-pos-menu-queries";
import { usePosTableOrderBootstrap } from "@/hooks/use-pos-table-order-bootstrap";
import { getAppApi } from "@/lib/app-api";
import { menuItemToModalData, menuItemToProductCard, parseMenuCategories, parseMenuItems, type MenuItemApiRow } from "@/lib/pos-menu-api";
import { queryKeys } from "@/lib/query-keys";
import { useOfflineRuntime } from "@/offline/offline-runtime-context";
import { useConnectivityStore } from "@/state/stores/connectivity-store";
import { usePosOrderStore } from "@/stores/pos-order-store";
import { useCustomerSearchQuery } from "@/hooks/use-customer-queries";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { posCategoryIconFromSlug } from "./pos-category-icons";
import { PosCategoryRail, type PosCategoryTab } from "./pos-category-rail";
import type { PosMenuItemModalData } from "./pos-menu-item-modal";
import { PosMenuItemModal } from "./pos-menu-item-modal";
import { cartLinesToOrderApiLines, posCartLineToPanelItem } from "./pos-order-cart-adapter";
import { PosOrderPanel, type PosOrderType } from "./pos-order-panel";
import { PosProductGrid } from "./pos-product-grid";
import type { PosProductCardModel } from "./pos-product-models";
import { PosSearchBar } from "./pos-search-bar";
import { formatDa } from "./pos-customization-pricing";

const emptyTakeawayDraft: TakeawayCustomerDraft = { name: "", phone: "", address: "", notes: "" };

function defaultIngredientState(row: MenuItemApiRow): { id: string; label: string; included: boolean }[] {
  return row.ingredients.map((i) => ({ id: i.id, label: i.name, included: true }));
}

export interface PosWorkspaceProps {
  className?: string;
  initialTableId?: string | null;
}

export function PosWorkspace({ className, initialTableId = null }: PosWorkspaceProps) {
  const { user, accessToken } = useAuth();
  const qc = useQueryClient();
  const enabled = Boolean(accessToken);
  const offline = useOfflineRuntime();
  const effectiveOffline = useConnectivityStore((s) => s.mode === "OFFLINE" || !s.browserReportsOnline);

  const categoriesQuery = usePosMenuCategoriesQuery(enabled);
  const itemsQuery = usePosMenuItemsQuery(enabled);
  const bootstrap = usePosTableOrderBootstrap(initialTableId, enabled);

  const categories = useMemo(() => parseMenuCategories(categoriesQuery.data), [categoriesQuery.data]);
  const items = useMemo(() => parseMenuItems(itemsQuery.data), [itemsQuery.data]);

  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const [activeCategoryId, setActiveCategoryId] = useState("");
  useEffect(() => {
    if (!activeCategoryId && categories[0]) setActiveCategoryId(categories[0].id);
  }, [activeCategoryId, categories]);

  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [customizeId, setCustomizeId] = useState<string | null>(null);
  const [kitchenDraftByItemId, setKitchenDraftByItemId] = useState<Record<string, string>>({});

  const [orderType, setOrderType] = useState<PosOrderType>("dine-in");
  const [tableNumber, setTableNumber] = useState("");
  const [takeawayDraft, setTakeawayDraft] = useState<TakeawayCustomerDraft>(emptyTakeawayDraft);
  const [customerSearch, setCustomerSearch] = useState("");
  const [takeawayFieldErrors, setTakeawayFieldErrors] = useState<Partial<Record<TakeawayCustomerFieldErrorKey, string>>>(
    {},
  );
  const [toast, setToast] = useState<string | null>(null);
  const [kitchenSending, setKitchenSending] = useState(false);
  const kitchenFlightRef = useRef(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const lines = usePosOrderStore((s) => s.lines);
  const tableId = usePosOrderStore((s) => s.tableId);
  const tableLabel = usePosOrderStore((s) => s.tableLabel);
  const activeOrderId = usePosOrderStore((s) => s.activeOrderId);
  const activeOrderVersion = usePosOrderStore((s) => s.activeOrderVersion);

  const { setTableContext, clearSession, hydrateFromOrderDetail, addLine, removeLine, incrementQty, decrementQty, setLineNotes, clearCart, computeTotals } =
    usePosOrderStore(
      useShallow((s) => ({
        setTableContext: s.setTableContext,
        clearSession: s.clearSession,
        hydrateFromOrderDetail: s.hydrateFromOrderDetail,
        addLine: s.addLine,
        removeLine: s.removeLine,
        incrementQty: s.incrementQty,
        decrementQty: s.decrementQty,
        setLineNotes: s.setLineNotes,
        clearCart: s.clearCart,
        computeTotals: s.computeTotals,
      })),
    );

  useEffect(() => {
    clearSession();
  }, [initialTableId, clearSession]);

  useEffect(() => {
    const d = bootstrap.data;
    if (!d?.tableId) return;
    setTableContext({ tableId: d.tableId, tableLabel: d.tableLabel });
    if (d.orderJson) hydrateFromOrderDetail(d.orderJson);
  }, [bootstrap.data, setTableContext, hydrateFromOrderDetail]);

  useEffect(() => {
    if (orderType === "dine-in") setTakeawayFieldErrors({});
  }, [orderType]);

  const savedCustomers = useTakeawayQueueStore((s) => s.savedCustomers);
  const addOrderFromPos = useTakeawayQueueStore((s) => s.addOrderFromPos);

  const categoryTabs: PosCategoryTab[] = useMemo(
    () =>
      categories.map((c) => ({
        id: c.id,
        label: c.name,
        count: c.itemCount,
        icon: posCategoryIconFromSlug(c.slug, c.name),
      })),
    [categories],
  );

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? categories[0];
  const categoryTitle = activeCategory?.name ?? "Menu";
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cid = activeCategory?.id;
    let list = cid ? items.filter((it) => it.category.id === cid) : items;
    if (q) {
      list = list.filter((it) => {
        const blob = `${it.name} ${it.description} ${it.category.name}`.toLowerCase();
        return blob.includes(q);
      });
    }
    return list;
  }, [items, activeCategory?.id, search]);

  const popularItems = useMemo(() => items.filter((it) => it.popular), [items]);

  const popularCards = useMemo(() => popularItems.map(menuItemToProductCard), [popularItems]);
  const gridCards = useMemo(() => filteredItems.map(menuItemToProductCard), [filteredItems]);

  const { data: savedMatches = [] } = useCustomerSearchQuery(customerSearch);

  const handleTakeawayDraftChange = (patch: Partial<TakeawayCustomerDraft>) => {
    setTakeawayDraft((d) => ({ ...d, ...patch }));
    setTakeawayFieldErrors((prev) => {
      const next = { ...prev };
      if (patch.name !== undefined) delete next.name;
      if (patch.phone !== undefined) delete next.phone;
      if (patch.address !== undefined) delete next.address;
      return next;
    });
  };

  const handlePickSavedCustomer = (c: TakeawayCustomer) => {
    setTakeawayDraft({
      name: c.name,
      phone: formatAlgeriaPhoneDisplay(c.phone),
      address: c.address,
      notes: c.notes,
    });
    setTakeawayFieldErrors({});
  };

  const customizeRow = customizeId ? itemById.get(customizeId) ?? null : null;
  const customizeModal: PosMenuItemModalData | null = customizeRow ? menuItemToModalData(customizeRow) : null;
  const modalKitchenNotes = customizeId ? (kitchenDraftByItemId[customizeId] ?? "") : "";

  const setModalKitchenNotes = (value: string) => {
    if (!customizeId) return;
    setKitchenDraftByItemId((m) => ({ ...m, [customizeId]: value }));
  };

  const handleQuickAdd = (product: PosProductCardModel) => {
    const row = itemById.get(product.id);
    if (!row) return;
    const needsModal = row.modifiers.length > 0 || row.ingredients.some((i) => i.removable);
    if (needsModal) {
      setCustomizeId(product.id);
      return;
    }
    const base = Math.round(Number.parseFloat(row.basePrice) || 0);
    addLine({
      menuItemId: row.id,
      name: row.name,
      quantity: 1,
      baseUnitPriceDa: base,
      modifierSelections: [],
      removedIngredientIds: [],
      ingredients: defaultIngredientState(row),
      notes: "",
      isDraftLine: true,
    });
  };

  const handleCustomize = (product: PosProductCardModel) => {
    setCustomizeId(product.id);
  };

  const panelLines = useMemo(() => lines.map(posCartLineToPanelItem), [lines]);
  const totals = useMemo(() => computeTotals(), [lines, computeTotals]);
  const totalLabel = formatDa(totals.totalDa);

  const dineInLockedLabel = tableLabel ? `Table ${tableLabel}` : null;

  const handleSendToKitchen = async () => {
    if (lines.length === 0) return;

    const runKitchenAsync = async (fn: () => Promise<void>) => {
      if (kitchenFlightRef.current) return;
      kitchenFlightRef.current = true;
      setKitchenSending(true);
      try {
        await fn();
      } finally {
        kitchenFlightRef.current = false;
        setKitchenSending(false);
      }
    };

    if (orderType === "takeaway") {
      const e = validateTakeawayCustomerDraft(takeawayDraft);
      setTakeawayFieldErrors(e);
      if (Object.keys(e).length > 0) return;

      await runKitchenAsync(async () => {
        try {
          // 1. Upsert customer
          const cRes: any = await getAppApi().customers.upsert({
            name: takeawayDraft.name.trim(),
            phone: takeawayDraft.phone,
            address: takeawayDraft.address.trim(),
            notes: takeawayDraft.notes.trim(),
          });
          const customerId = cRes.id;

          // 2. Create order
          const apiLines = cartLinesToOrderApiLines(lines);
          const clientMutationId =
            typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;
          
          await getAppApi().orders.create({
            type: "TAKEAWAY",
            customerId,
            waiterId: user?.id ?? null,
            kitchenNotes: buildTakeawayKitchenNotes(panelLines),
            lines: apiLines,
            clientMutationId,
          });

          clearCart();
          setTakeawayDraft(emptyTakeawayDraft);
          setCustomerSearch("");
          setTakeawayFieldErrors({});
          setCartOpen(false);
          flash("Commande à emporter créée.");
          
          await qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
          await qc.invalidateQueries({ queryKey: queryKeys.orders.takeawayBoard() });
          await qc.invalidateQueries({ queryKey: queryKeys.orders.takeawayHistory() });
        } catch (err: any) {
          flash(err.message || "Erreur lors de la création de la commande.");
        }
      });
      return;
    }

    const draftLines = lines.filter((l) => l.isDraftLine);
    if (activeOrderId && draftLines.length === 0) {
      flash("Ajoutez des articles pour compléter la commande.");
      return;
    }

    const apiLines = cartLinesToOrderApiLines(activeOrderId ? draftLines : lines);
    if (apiLines.length === 0) {
      flash("Panier vide.");
      return;
    }

    const resolvedTableId = tableId ?? null;
    const partySize = tableNumber.trim() ? Number.parseInt(tableNumber.trim(), 10) : 1;

    if (!activeOrderId && !resolvedTableId) {
      flash("Choisissez une table (ou ouvrez le POS depuis une table).");
      return;
    }

    const online = !effectiveOffline;

    if (activeOrderId) {
      if (!online) {
        if (!user?.restaurantId) {
          flash("Session requise pour la file d’attente hors ligne.");
          return;
        }
        const clientMutationId =
          typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;
        await runKitchenAsync(async () => {
          try {
            await offline.sync.enqueue({
              tenantId: user.restaurantId,
              deviceId: getOrCreateDeviceId(),
              kind: "order.line.add",
              idempotencyKey: null,
              clientMutationId,
              baseServerVersion: activeOrderVersion,
              payload: {
                orderId: activeOrderId,
                lines: apiLines,
                ...(activeOrderVersion != null ? { version: activeOrderVersion } : {}),
              },
            });
            for (const line of draftLines) {
              removeLine(line.id);
            }
            flash("Hors ligne : articles mis en file de synchronisation.");
            setCartOpen(false);
          } catch (e) {
            flash(e instanceof Error ? e.message : "Impossible d’enfiler la mutation hors ligne.");
          }
        });
        return;
      }
      await runKitchenAsync(async () => {
        try {
          const data = await getAppApi().orders.addLines(activeOrderId, {
            lines: apiLines,
            ...(activeOrderVersion != null ? { version: activeOrderVersion } : {}),
          });
          hydrateFromOrderDetail(data);
          await qc.invalidateQueries({ queryKey: queryKeys.tables.layout() });
          if (tableId) await qc.invalidateQueries({ queryKey: queryKeys.pos.tableBootstrap(tableId) });
          flash("Articles envoyés en cuisine.");
          setCartOpen(false);
        } catch {
          flash("Impossible d’ajouter les articles (réseau ou version).");
        }
      });
      return;
    }

    if (!resolvedTableId) {
      flash("Choisissez une table (ou ouvrez le POS depuis une table).");
      return;
    }

    const body = {
      type: "DINE_IN" as const,
      tableId: resolvedTableId,
      waiterId: user?.id ?? null,
      partySize: Number.isFinite(partySize) && partySize > 0 ? partySize : 1,
      kitchenNotes: null,
      customerNotes: null,
      lines: apiLines,
    };

    if (!online && user?.restaurantId) {
      const clientMutationId =
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;
      await runKitchenAsync(async () => {
        try {
          await offline.sync.enqueue({
            tenantId: user.restaurantId,
            deviceId: getOrCreateDeviceId(),
            kind: "order.create",
            idempotencyKey: null,
            clientMutationId,
            baseServerVersion: null,
            payload: { ...body, clientMutationId },
          });
          clearCart();
          setTableNumber("");
          setCartOpen(false);
          flash("Hors ligne : commande enregistrée. Synchronisation automatique à la reconnexion.");
        } catch (e) {
          flash(e instanceof Error ? e.message : "Impossible d’enfiler la commande hors ligne.");
        }
      });
      return;
    }

    await runKitchenAsync(async () => {
      try {
        const clientMutationId =
          typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;
        const data = await getAppApi().orders.create({ ...body, clientMutationId });
        hydrateFromOrderDetail(data);
        await qc.invalidateQueries({ queryKey: queryKeys.tables.layout() });
        if (resolvedTableId) await qc.invalidateQueries({ queryKey: queryKeys.pos.tableBootstrap(resolvedTableId) });
        flash("Commande créée et envoyée en cuisine.");
        setCartOpen(false);
      } catch {
        flash("Impossible d’envoyer la commande.");
      }
    });
  };

  const loadingMenu = categoriesQuery.isLoading || itemsQuery.isLoading;
  const menuError = categoriesQuery.isError || itemsQuery.isError;

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent", className)}>
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[100] max-w-md -translate-x-1/2 rounded-xl border border-pos-border-subtle bg-pos-depth/95 px-4 py-3 text-center text-sm font-semibold text-foreground shadow-surface-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <PosSearchBar value={search} onChange={setSearch} filterActiveCount={search.trim() ? 1 : 0} />

        {menuError ? (
          <div className="border-b border-red-500/30 bg-red-950/30 px-4 py-2 text-sm text-red-100">Impossible de charger le menu.</div>
        ) : null}

        {loadingMenu && items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">Chargement du menu…</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
            <PosCategoryRail
              categories={categoryTabs}
              activeId={activeCategoryId}
              onSelect={setActiveCategoryId}
              className="shrink-0 xl:min-h-0"
            />

            <PosProductGrid
              popular={popularCards}
              categoryTitle={categoryTitle}
              categoryCount={filteredItems.length}
              products={gridCards}
              onQuickAdd={handleQuickAdd}
              onCustomize={handleCustomize}
              className="min-w-0 flex-1 xl:border-r xl:border-pos-border-subtle"
            />

            <PosOrderPanel
              className="hidden min-h-0 shrink-0 xl:flex"
              lines={panelLines}
              itemCount={totals.itemCount}
              totalLabel={totalLabel}
              onIncrementQty={incrementQty}
              onDecrementQty={decrementQty}
              onRemoveLine={removeLine}
              onSetLineNotes={setLineNotes}
              orderType={orderType}
              onOrderTypeChange={setOrderType}
              tableNumber={tableNumber}
              onTableNumberChange={setTableNumber}
              dineInTableLockedLabel={dineInLockedLabel}
              sendDisabled={
                orderType === "dine-in" &&
                ((Boolean(activeOrderId) && !lines.some((l) => l.isDraftLine)) || (!activeOrderId && !tableId))
              }
              sendLoading={kitchenSending}
              takeawayCustomer={{
                draft: takeawayDraft,
                onDraftChange: handleTakeawayDraftChange,
                customerSearch,
                onCustomerSearchChange: setCustomerSearch,
                savedMatches,
                onPickSavedCustomer: handlePickSavedCustomer,
                fieldErrors: takeawayFieldErrors,
              }}
              onSendToKitchen={() => void handleSendToKitchen()}
            />
          </div>
        )}
      </div>

      <div className="relative z-[1] shrink-0 overflow-hidden border-t border-border bg-card/95 p-3 shadow-surface-sm backdrop-blur-md xl:hidden">
        <Button
          type="button"
          className="relative h-12 w-full gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-surface-sm hover:bg-primary/90 hover:shadow-surface-md"
          onClick={() => setCartOpen(true)}
        >
          <ShoppingBag className="h-5 w-5" aria-hidden />
          Panier · {totalLabel}
        </Button>
      </div>

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="right"
          className="w-full gap-0 border-l border-border bg-card p-0 shadow-surface-lg sm:max-w-md"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Commande</SheetTitle>
          </SheetHeader>
          <PosOrderPanel
            className="h-full border-0"
            lines={panelLines}
            itemCount={totals.itemCount}
            totalLabel={totalLabel}
            onIncrementQty={incrementQty}
            onDecrementQty={decrementQty}
            onRemoveLine={removeLine}
            onSetLineNotes={setLineNotes}
            orderType={orderType}
            onOrderTypeChange={setOrderType}
            tableNumber={tableNumber}
            onTableNumberChange={setTableNumber}
            dineInTableLockedLabel={dineInLockedLabel}
            sendDisabled={
              orderType === "dine-in" &&
              ((Boolean(activeOrderId) && !lines.some((l) => l.isDraftLine)) || (!activeOrderId && !tableId))
            }
            sendLoading={kitchenSending}
            takeawayCustomer={{
              draft: takeawayDraft,
              onDraftChange: handleTakeawayDraftChange,
              customerSearch,
              onCustomerSearchChange: setCustomerSearch,
              savedMatches,
              onPickSavedCustomer: handlePickSavedCustomer,
              fieldErrors: takeawayFieldErrors,
            }}
            onSendToKitchen={() => void handleSendToKitchen()}
          />
        </SheetContent>
      </Sheet>

      <PosMenuItemModal
        open={customizeId !== null}
        onOpenChange={(open) => {
          if (!open) setCustomizeId(null);
        }}
        item={customizeModal}
        kitchenNotes={modalKitchenNotes}
        onKitchenNotesChange={setModalKitchenNotes}
        onAddToCart={(draft) => {
          addLine(draft);
          if (customizeId) {
            setKitchenDraftByItemId((m) => {
              const { [customizeId]: _, ...rest } = m;
              return rest;
            });
          }
        }}
      />
    </div>
  );
}
