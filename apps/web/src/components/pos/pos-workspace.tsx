import { getOrCreateDeviceId } from "@pos/offline-engine";
import { ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShallow } from "zustand/react/shallow";

import { PageQueryState } from "@/components/data/page-query-state";
import { useAuth } from "@/auth/auth-context";
import type { TakeawayCustomer } from "@/components/takeaway/takeaway-customer-types";
import type { TakeawayCustomerDraft, TakeawayCustomerFieldErrorKey } from "@/components/takeaway/takeaway-customer-validation";
import {
  buildOptionalTakeawayCustomerUpsert,
  buildTakeawayKitchenNotes,
  buildTakeawayOrderCustomerNotes,
  isTakeawayOrderEditable,
  takeawayDraftFromOrderDetail,
} from "@/components/takeaway/takeaway-pos-bridge";
import { formatAlgeriaPhoneDisplay, phoneKey } from "@/components/takeaway/takeaway-phone-utils";
import { usePosMenuQuery } from "@/hooks/use-pos-menu-queries";
import { usePosTableOrderBootstrap } from "@/hooks/use-pos-table-order-bootstrap";
import { getAppApi } from "@/lib/app-api";
import { isKitchenSendIncomplete, kitchenSendFailureMessage } from "@/lib/kitchen-response";
import { menuItemToModalData, menuItemToProductCard, type MenuItemApiRow } from "@/lib/pos-menu-api";
import { fr } from "@/lib/locale/fr";
import { queryKeys } from "@/lib/query-keys";
import { findTableIdByNumberInLayout } from "@/lib/tables-layout-cache";
import { useOfflineRuntime } from "@/offline/offline-runtime-context";
import { useConnectivityStore } from "@/state/stores/connectivity-store";
import {
  extractOrderVersionFromDetail,
  orderHasPendingKitchenSend,
  usePosOrderStore,
} from "@/stores/pos-order-store";
import { useCustomerSearchQuery } from "@/hooks/use-customer-queries";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { posCategoryIconFromSlug } from "./pos-category-icons";
import { PosCategoryRail, type PosCategoryTab } from "./pos-category-rail";
import type { PosMenuItemModalData } from "./pos-menu-item-modal";
import { PosMenuItemModal } from "./pos-menu-item-modal";
import {
  buildAddOrderLinesBody,
  buildOrderCreateBody,
  buildDispatchPendingKitchenBody,
  buildOrderLinePatchBody,
  buildOrderPatchBody,
  cartLinesToOrderApiLines,
  posCartLineToPanelItem,
} from "./pos-order-cart-adapter";
import { PosOrderPanel, type PosOrderType } from "./pos-order-panel";
import { PosProductGrid } from "./pos-product-grid";
import type { PosProductCardModel } from "./pos-product-models";
import { PosSearchBar } from "./pos-search-bar";
import { formatDa } from "./pos-customization-pricing";

const emptyTakeawayDraft: TakeawayCustomerDraft = { name: "", phone: "", address: "", notes: "" };

function defaultIngredientState(row: MenuItemApiRow): { id: string; label: string; included: boolean }[] {
  return row.ingredients.map((i) => ({ id: i.id, label: i.name, included: true }));
}

function newClientMutationId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;
}

function isTableUuid(value?: string | null): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export interface PosWorkspaceProps {
  className?: string;
  initialTableId?: string | null;
  /** Open POS in takeaway edit mode for an existing order (`/orders?editOrderId=…`). */
  initialEditOrderId?: string | null;
}

export function PosWorkspace({ className, initialTableId = null, initialEditOrderId = null }: PosWorkspaceProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const offline = useOfflineRuntime();
  const effectiveOffline = useConnectivityStore((s) => s.mode === "OFFLINE" || !s.browserReportsOnline);

  const menuQuery = usePosMenuQuery();
  const bootstrap = usePosTableOrderBootstrap(initialTableId);

  const menuData = menuQuery.data;
  const categories = menuData?.categories ?? [];
  const items = menuData?.items ?? [];

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
  const [editingTakeawayLabel, setEditingTakeawayLabel] = useState<string | null>(null);
  const [takeawayEditLocked, setTakeawayEditLocked] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [kitchenSending, setKitchenSending] = useState(false);
  const kitchenFlightRef = useRef(false);
  const toastTimeoutRef = useRef<number | null>(null);
  const lineNotesPatchTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const flash = useCallback((msg: string) => {
    if (toastTimeoutRef.current != null) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast(msg);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 3200);
  }, []);

  const completeKitchenSendSuccess = useCallback(
    (message: string) => {
      flash(message);
      setCartOpen(false);
    },
    [flash],
  );

  const lines = usePosOrderStore((s) => s.lines);
  const tableId = usePosOrderStore((s) => s.tableId);
  const tableLabel = usePosOrderStore((s) => s.tableLabel);
  const activeOrderId = usePosOrderStore((s) => s.activeOrderId);
  const activeOrderVersion = usePosOrderStore((s) => s.activeOrderVersion);
  const waiterName = usePosOrderStore((s) => s.waiterName);
  const persistedWaiterName = usePosOrderStore((s) => s.persistedWaiterName);
  const orderLinesEditable = usePosOrderStore((s) => s.orderLinesEditable);
  const pendingKitchenRemovalCount = usePosOrderStore((s) => s.pendingKitchenRemovalCount);

  const { setTableContext, clearSession, hydrateFromOrderDetail, setWaiterName, addLine, removeLine, changeQty, incrementQty, decrementQty, setLineNotes, incrementPendingKitchenRemoval, clearCart, computeTotals } =
    usePosOrderStore(
      useShallow((s) => ({
        setTableContext: s.setTableContext,
        clearSession: s.clearSession,
        setWaiterName: s.setWaiterName,
        hydrateFromOrderDetail: s.hydrateFromOrderDetail,
        addLine: s.addLine,
        removeLine: s.removeLine,
        changeQty: s.changeQty,
        incrementQty: s.incrementQty,
        decrementQty: s.decrementQty,
        setLineNotes: s.setLineNotes,
        incrementPendingKitchenRemoval: s.incrementPendingKitchenRemoval,
        clearCart: s.clearCart,
        computeTotals: s.computeTotals,
      })),
    );

  useEffect(() => {
    if (initialEditOrderId) return;
    clearSession();
    setTakeawayEditLocked(false);
    setEditingTakeawayLabel(null);
  }, [initialTableId, initialEditOrderId, clearSession]);

  useEffect(() => {
    if (!initialEditOrderId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await getAppApi().orders.get(initialEditOrderId);
        if (cancelled) return;
        if (!isTakeawayOrderEditable(data)) {
          flash("Cette commande à emporter ne peut plus être modifiée.");
          return;
        }
        const o = data as Record<string, unknown>;
        setOrderType("takeaway");
        setTakeawayEditLocked(true);
        setEditingTakeawayLabel(
          typeof o.orderNumber === "string" || typeof o.orderNumber === "number"
            ? String(o.orderNumber)
            : null,
        );
        hydrateFromOrderDetail(data);
        setTakeawayDraft(takeawayDraftFromOrderDetail(data));
        setCustomerSearch("");
        setTakeawayFieldErrors({});
        setCartOpen(true);
      } catch (err: unknown) {
        if (!cancelled) {
          flash(err instanceof Error ? err.message : "Impossible de charger la commande.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEditOrderId, flash, hydrateFromOrderDetail]);

  useEffect(() => {
    const d = bootstrap.data;
    if (!d?.tableId) return;
    setTableContext({ tableId: d.tableId, tableLabel: d.tableLabel });
    if (d.orderJson) {
      hydrateFromOrderDetail(d.orderJson);
      return;
    }
    usePosOrderStore.setState({
      activeOrderId: null,
      activeOrderVersion: null,
      lines: [],
      pendingKitchenRemovalCount: 0,
      orderLinesEditable: true,
      waiterName: "",
      persistedWaiterName: "",
    });
  }, [bootstrap.data, setTableContext, hydrateFromOrderDetail]);

  useEffect(() => {
    if (orderType === "dine-in") setTakeawayFieldErrors({});
  }, [orderType]);

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

  const catalogPopularRows = useMemo(() => items.filter((it) => it.popular), [items]);

  const popularCards = useMemo(() => catalogPopularRows.map(menuItemToProductCard), [catalogPopularRows]);
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

  const canSendToKitchen = useMemo(
    () => orderHasPendingKitchenSend(lines, pendingKitchenRemovalCount),
    [lines, pendingKitchenRemovalCount],
  );

  const takeawaySendDisabled =
    lines.length === 0 ||
    (Boolean(activeOrderId) && orderType === "takeaway" && !canSendToKitchen);

  const panelSendLabel =
    orderType === "takeaway" && activeOrderId ? fr.pos.saveTakeawayChanges : undefined;

  const panelLines = useMemo(
    () => lines.map((l) => posCartLineToPanelItem(l, { orderLinesEditable })),
    [lines, orderLinesEditable],
  );
  const totals = useMemo(() => computeTotals(), [lines, computeTotals]);
  const totalLabel = formatDa(totals.totalDa);

  const invalidateOrderQueries = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.tables.layout() });
    if (tableId) void qc.invalidateQueries({ queryKey: queryKeys.pos.tableBootstrap(tableId) });
  }, [qc, tableId]);

  const invalidateTakeawayOrderQueries = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.orders.takeawayBoard() });
    void qc.invalidateQueries({ queryKey: queryKeys.orders.takeawayHistory() });
    void qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
  }, [qc]);

  const mutatePersistedLine = useCallback(
    async (mutate: (orderVersion: number | null) => Promise<unknown>) => {
      if (!activeOrderId || !orderLinesEditable || effectiveOffline) return;
      try {
        const data = await mutate(activeOrderVersion);
        hydrateFromOrderDetail(data);
        invalidateOrderQueries();
        if (orderType === "takeaway" && activeOrderId) {
          invalidateTakeawayOrderQueries();
        }
      } catch {
        flash("Impossible de modifier l’article (réseau ou version).");
      }
    },
    [
      activeOrderId,
      activeOrderVersion,
      effectiveOffline,
      flash,
      hydrateFromOrderDetail,
      invalidateOrderQueries,
      invalidateTakeawayOrderQueries,
      orderLinesEditable,
      orderType,
    ],
  );

  const handleIncrementQty = useCallback(
    (lineId: string) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line || !orderLinesEditable) return;
      if (line.isDraftLine) {
        incrementQty(lineId);
        return;
      }
      if (!activeOrderId) return;

      const nextQty = line.quantity + 1;

      if (effectiveOffline) {
        const clientMutationId = newClientMutationId();
        if (!user?.restaurantId) {
          flash("Session requise pour la file d’attente hors ligne.");
          return;
        }
        void offline.sync
          .enqueue({
            tenantId: user.restaurantId,
            deviceId: getOrCreateDeviceId(),
            kind: "order.line.update",
            idempotencyKey: null,
            clientMutationId,
            baseServerVersion: activeOrderVersion,
            payload: {
              orderId: activeOrderId,
              lineId,
              ...buildOrderLinePatchBody({
                quantity: nextQty,
                clientMutationId,
                ...(activeOrderVersion != null ? { version: activeOrderVersion } : {}),
              }),
            },
          })
          .then(() => changeQty(lineId, nextQty))
          .catch((e) => flash(e instanceof Error ? e.message : "Impossible d’enfiler la mutation hors ligne."));
        return;
      }

      void mutatePersistedLine((orderVersion) =>
        getAppApi().orders.patchLine(
          activeOrderId,
          lineId,
          buildOrderLinePatchBody({
            quantity: nextQty,
            clientMutationId: newClientMutationId(),
            ...(orderVersion != null ? { version: orderVersion } : {}),
          }),
        ),
      );
    },
    [
      activeOrderId,
      activeOrderVersion,
      changeQty,
      effectiveOffline,
      flash,
      incrementQty,
      lines,
      mutatePersistedLine,
      offline.sync,
      orderLinesEditable,
      user?.restaurantId,
    ],
  );

  const handleDecrementQty = useCallback(
    (lineId: string) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line || !orderLinesEditable || line.quantity <= 1) return;
      if (line.isDraftLine) {
        decrementQty(lineId);
        return;
      }
      if (!activeOrderId) return;

      const nextQty = line.quantity - 1;

      if (effectiveOffline) {
        const clientMutationId = newClientMutationId();
        if (!user?.restaurantId) {
          flash("Session requise pour la file d’attente hors ligne.");
          return;
        }
        void offline.sync
          .enqueue({
            tenantId: user.restaurantId,
            deviceId: getOrCreateDeviceId(),
            kind: "order.line.update",
            idempotencyKey: null,
            clientMutationId,
            baseServerVersion: activeOrderVersion,
            payload: {
              orderId: activeOrderId,
              lineId,
              ...buildOrderLinePatchBody({
                quantity: nextQty,
                clientMutationId,
                ...(activeOrderVersion != null ? { version: activeOrderVersion } : {}),
              }),
            },
          })
          .then(() => changeQty(lineId, nextQty))
          .catch((e) => flash(e instanceof Error ? e.message : "Impossible d’enfiler la mutation hors ligne."));
        return;
      }

      void mutatePersistedLine((orderVersion) =>
        getAppApi().orders.patchLine(
          activeOrderId,
          lineId,
          buildOrderLinePatchBody({
            quantity: nextQty,
            clientMutationId: newClientMutationId(),
            ...(orderVersion != null ? { version: orderVersion } : {}),
          }),
        ),
      );
    },
    [
      activeOrderId,
      activeOrderVersion,
      changeQty,
      decrementQty,
      effectiveOffline,
      flash,
      lines,
      mutatePersistedLine,
      offline.sync,
      orderLinesEditable,
      user?.restaurantId,
    ],
  );

  const handleSetLineNotes = useCallback(
    (lineId: string, notes: string) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line || !orderLinesEditable) return;
      setLineNotes(lineId, notes);
      if (line.isDraftLine || !activeOrderId) return;

      const prev = lineNotesPatchTimerRef.current.get(lineId);
      if (prev) clearTimeout(prev);

      const timer = setTimeout(() => {
        lineNotesPatchTimerRef.current.delete(lineId);
        const trimmed = notes.trim();
        const clientMutationId = newClientMutationId();

        if (effectiveOffline) {
          if (!user?.restaurantId) {
            flash("Session requise pour la file d’attente hors ligne.");
            return;
          }
          void offline.sync
            .enqueue({
              tenantId: user.restaurantId,
              deviceId: getOrCreateDeviceId(),
              kind: "order.line.update",
              idempotencyKey: null,
              clientMutationId,
              baseServerVersion: activeOrderVersion,
              payload: {
                orderId: activeOrderId,
                lineId,
                ...buildOrderLinePatchBody({
                  kitchenNotes: trimmed ? trimmed : null,
                  clientMutationId,
                  ...(activeOrderVersion != null ? { version: activeOrderVersion } : {}),
                }),
              },
            })
            .catch((e) => flash(e instanceof Error ? e.message : "Impossible d’enfiler la mutation hors ligne."));
          return;
        }

        void mutatePersistedLine((orderVersion) =>
          getAppApi().orders.patchLine(
            activeOrderId,
            lineId,
            buildOrderLinePatchBody({
              kitchenNotes: trimmed ? trimmed : null,
              clientMutationId,
              ...(orderVersion != null ? { version: orderVersion } : {}),
            }),
          ),
        );
      }, 600);

      lineNotesPatchTimerRef.current.set(lineId, timer);
    },
    [
      activeOrderId,
      activeOrderVersion,
      effectiveOffline,
      flash,
      lines,
      mutatePersistedLine,
      offline.sync,
      orderLinesEditable,
      setLineNotes,
      user?.restaurantId,
    ],
  );

  const handleRemoveLine = useCallback(
    (lineId: string) => {
      const line = lines.find((l) => l.id === lineId);
      if (!line || !orderLinesEditable) return;
      if (line.isDraftLine) {
        removeLine(lineId);
        return;
      }
      if (!activeOrderId) return;

      if (effectiveOffline) {
        const clientMutationId = newClientMutationId();
        if (!user?.restaurantId) {
          flash("Session requise pour la file d’attente hors ligne.");
          return;
        }
        void offline.sync
          .enqueue({
            tenantId: user.restaurantId,
            deviceId: getOrCreateDeviceId(),
            kind: "order.line.delete",
            idempotencyKey: null,
            clientMutationId,
            baseServerVersion: activeOrderVersion,
            payload: {
              orderId: activeOrderId,
              lineId,
              query: {
                ...(activeOrderVersion != null ? { version: String(activeOrderVersion) } : {}),
                clientMutationId,
              },
            },
          })
          .then(() => removeLine(lineId))
          .catch((e) => flash(e instanceof Error ? e.message : "Impossible d’enfiler la mutation hors ligne."));
        return;
      }

      void (async () => {
        if (!activeOrderId || !orderLinesEditable) return;
        try {
          const clientMutationId = newClientMutationId();
          const query: Record<string, string> = { clientMutationId };
          if (activeOrderVersion != null) query.version = String(activeOrderVersion);
          const data = await getAppApi().orders.deleteLine(activeOrderId, lineId, query);
          if (isKitchenSendIncomplete(data)) {
            flash(kitchenSendFailureMessage(data));
            return;
          }
          hydrateFromOrderDetail(data);
          invalidateOrderQueries();
          if (orderType === "takeaway") {
            invalidateTakeawayOrderQueries();
          }
        } catch {
          flash("Impossible de modifier l’article (réseau ou version).");
        }
      })();
    },
    [
      activeOrderId,
      activeOrderVersion,
      effectiveOffline,
      flash,
      hydrateFromOrderDetail,
      incrementPendingKitchenRemoval,
      invalidateOrderQueries,
      invalidateTakeawayOrderQueries,
      orderType,
      lines,
      offline.sync,
      orderLinesEditable,
      removeLine,
      user?.restaurantId,
    ],
  );

  const dineInLockedLabel = tableLabel ? `Table ${tableLabel}` : null;

  const handleSendToKitchen = async () => {
    if (lines.length === 0 || kitchenFlightRef.current) return;

    kitchenFlightRef.current = true;
    setKitchenSending(true);

    try {
    if (orderType === "takeaway") {
      setTakeawayFieldErrors({});

      if (activeOrderId) {
        const draftLines = lines.filter((l) => l.isDraftLine);
        const hasPendingKitchen = orderHasPendingKitchenSend(lines, pendingKitchenRemovalCount);
        if (!hasPendingKitchen && draftLines.length === 0) {
          flash("Aucune modification à envoyer.");
          return;
        }
        const apiLines = cartLinesToOrderApiLines(draftLines);
        if (!effectiveOffline) {
          try {
            const clientMutationId = newClientMutationId();
            let orderVersion = activeOrderVersion;
            if (apiLines.length > 0) {
              const data = await getAppApi().orders.addLines(
                activeOrderId,
                buildAddOrderLinesBody({
                  lines: apiLines,
                  clientMutationId,
                  ...(orderVersion != null ? { version: orderVersion } : {}),
                }),
              );
              if (isKitchenSendIncomplete(data)) {
                flash(kitchenSendFailureMessage(data));
                return;
              }
              hydrateFromOrderDetail(data);
              const hydratedVersion = extractOrderVersionFromDetail(data);
              if (hydratedVersion != null) {
                orderVersion = hydratedVersion;
              }
              for (const line of draftLines) {
                removeLine(line.id);
              }
            }

            const stateAfterAdd = usePosOrderStore.getState();
            if (
              orderHasPendingKitchenSend(
                stateAfterAdd.lines,
                stateAfterAdd.pendingKitchenRemovalCount,
              )
            ) {
              const pendingData = await getAppApi().orders.dispatchPendingKitchen(
                activeOrderId,
                buildDispatchPendingKitchenBody({
                  clientMutationId: newClientMutationId(),
                  ...(orderVersion != null ? { version: orderVersion } : {}),
                }),
              );
              if (isKitchenSendIncomplete(pendingData)) {
                flash(kitchenSendFailureMessage(pendingData));
                return;
              }
              usePosOrderStore.setState({ pendingKitchenRemovalCount: 0 });
              hydrateFromOrderDetail(pendingData);
            }

            const stateForKitchenCheck = usePosOrderStore.getState();
            if (
              orderHasPendingKitchenSend(
                stateForKitchenCheck.lines,
                stateForKitchenCheck.pendingKitchenRemovalCount,
              )
            ) {
              flash("Certains changements cuisine n’ont pas été envoyés.");
              return;
            }

            invalidateTakeawayOrderQueries();
            completeKitchenSendSuccess("Modifications enregistrées.");
          } catch (err: unknown) {
            flash(err instanceof Error ? err.message : "Impossible d’enregistrer les modifications.");
          }
        } else {
          flash("Modification hors ligne non disponible pour les commandes existantes.");
        }
        return;
      }

        try {
          const upsertPayload = buildOptionalTakeawayCustomerUpsert(takeawayDraft);
          let customerId: string | null = null;
          if (upsertPayload) {
            const cRes = (await getAppApi().customers.upsert(upsertPayload)) as { id?: string };
            customerId = typeof cRes.id === "string" ? cRes.id : null;
          }

          const apiLines = cartLinesToOrderApiLines(lines);
          const clientMutationId =
            typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;

          const created = await getAppApi().orders.create(
            buildOrderCreateBody({
              type: "TAKEAWAY",
              customerId,
              waiterId: user?.id ?? null,
              waiterName: waiterName.trim() || null,
              customerNotes: buildTakeawayOrderCustomerNotes(takeawayDraft),
              kitchenNotes: buildTakeawayKitchenNotes(panelLines),
              lines: apiLines,
              clientMutationId,
            }),
          );

          if (isKitchenSendIncomplete(created)) {
            flash(kitchenSendFailureMessage(created));
            return;
          }

          clearCart();
          setTakeawayDraft(emptyTakeawayDraft);
          setCustomerSearch("");
          setTakeawayFieldErrors({});
          completeKitchenSendSuccess("Commande à emporter créée.");

          void qc.invalidateQueries({ queryKey: queryKeys.orders.all() });
          void qc.invalidateQueries({ queryKey: queryKeys.orders.takeawayBoard() });
          void qc.invalidateQueries({ queryKey: queryKeys.orders.takeawayHistory() });
        } catch (err: unknown) {
          flash(err instanceof Error ? err.message : "Erreur lors de la création de la commande.");
        }
      return;
    }

    const draftLines = lines.filter((l) => l.isDraftLine);
    const hasPendingKitchen = orderHasPendingKitchenSend(lines, pendingKitchenRemovalCount);

    if (activeOrderId && !hasPendingKitchen) {
      flash("Ajoutez des articles pour compléter la commande.");
      return;
    }

    const apiLines = cartLinesToOrderApiLines(activeOrderId ? draftLines : lines);
    if (apiLines.length === 0 && !(activeOrderId && hasPendingKitchen)) {
      flash("Panier vide.");
      return;
    }

    const normalizedTableNumber = tableNumber.trim();

    let resolvedTableId: string | null = null;
    if (initialTableId && isTableUuid(initialTableId)) {
      resolvedTableId = initialTableId;
    } else if (isTableUuid(tableId)) {
      resolvedTableId = tableId;
    } else if (bootstrap.data?.tableId && isTableUuid(bootstrap.data.tableId)) {
      resolvedTableId = bootstrap.data.tableId;
    }

    if (!resolvedTableId && normalizedTableNumber) {
      try {
        const layout = await getAppApi().tables.getLayout();
        resolvedTableId = findTableIdByNumberInLayout(layout, normalizedTableNumber) ?? null;
      } catch {
        /* lookup failed — handled below */
      }
    }

    const partySize = 1;

    if (!activeOrderId && !resolvedTableId) {
      flash(
        normalizedTableNumber
          ? `Table ${normalizedTableNumber} introuvable.`
          : "Entrez un numéro de table.",
      );
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
                ...buildAddOrderLinesBody({
                  lines: apiLines,
                  clientMutationId,
                  ...(activeOrderVersion != null ? { version: activeOrderVersion } : {}),
                }),
              },
            });
            for (const line of draftLines) {
              removeLine(line.id);
            }
            completeKitchenSendSuccess("Hors ligne : articles mis en file de synchronisation.");
          } catch (e) {
            flash(e instanceof Error ? e.message : "Impossible d’enfiler la mutation hors ligne.");
          }
        return;
      }
        try {
          const clientMutationId =
            typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;
          const trimmedWaiter = waiterName.trim() || null;
          let orderVersion = activeOrderVersion;
          const needsWaiterSync = waiterName.trim() !== persistedWaiterName;
          if (needsWaiterSync) {
            const patchData = await getAppApi().orders.patch(
              activeOrderId,
              buildOrderPatchBody({
                waiterName: trimmedWaiter,
                ...(orderVersion != null ? { version: orderVersion } : {}),
              }),
            );
            const patchedVersion = extractOrderVersionFromDetail(patchData);
            if (patchedVersion != null) {
              orderVersion = patchedVersion;
            }
          }
          if (apiLines.length > 0) {
            const data = await getAppApi().orders.addLines(
              activeOrderId,
              buildAddOrderLinesBody({
                lines: apiLines,
                clientMutationId,
                ...(orderVersion != null ? { version: orderVersion } : {}),
              }),
            );
            if (isKitchenSendIncomplete(data)) {
              flash(kitchenSendFailureMessage(data));
              return;
            }
            hydrateFromOrderDetail(data);
            const hydratedVersion = extractOrderVersionFromDetail(data);
            if (hydratedVersion != null) {
              orderVersion = hydratedVersion;
            }
            for (const line of draftLines) {
              removeLine(line.id);
            }
          }

          const stateAfterAdd = usePosOrderStore.getState();
          if (
            orderHasPendingKitchenSend(
              stateAfterAdd.lines,
              stateAfterAdd.pendingKitchenRemovalCount,
            )
          ) {
            const pendingData = await getAppApi().orders.dispatchPendingKitchen(
              activeOrderId,
              buildDispatchPendingKitchenBody({
                clientMutationId: newClientMutationId(),
                ...(orderVersion != null ? { version: orderVersion } : {}),
              }),
            );
            if (isKitchenSendIncomplete(pendingData)) {
              flash(kitchenSendFailureMessage(pendingData));
              return;
            }
            usePosOrderStore.setState({ pendingKitchenRemovalCount: 0 });
            hydrateFromOrderDetail(pendingData);
          }

          const stateForKitchenCheck = usePosOrderStore.getState();
          if (
            orderHasPendingKitchenSend(
              stateForKitchenCheck.lines,
              stateForKitchenCheck.pendingKitchenRemovalCount,
            )
          ) {
            flash("Certains changements cuisine n’ont pas été envoyés.");
            return;
          }

          completeKitchenSendSuccess("Articles envoyés en cuisine.");
          void qc.invalidateQueries({ queryKey: queryKeys.tables.layout() });
          if (tableId) void qc.invalidateQueries({ queryKey: queryKeys.pos.tableBootstrap(tableId) });
        } catch (err: unknown) {
          flash(err instanceof Error ? err.message : "Impossible d’ajouter les articles (réseau ou version).");
        }
      return;
    }

    const body = buildOrderCreateBody({
      type: "DINE_IN",
      partySize,
      lines: apiLines,
      waiterName: waiterName.trim() || null,
      ...(user?.id ? { waiterId: user.id } : {}),
      ...(resolvedTableId ? { tableId: resolvedTableId } : {}),
    });

    if (!online && user?.restaurantId) {
      const clientMutationId =
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;
        try {
          await offline.sync.enqueue({
            tenantId: user.restaurantId,
            deviceId: getOrCreateDeviceId(),
            kind: "order.create",
            idempotencyKey: null,
            clientMutationId,
            baseServerVersion: null,
            payload: buildOrderCreateBody({ ...body, clientMutationId }),
          });
          clearCart();
          setTableNumber("");
          completeKitchenSendSuccess("Hors ligne : commande enregistrée. Synchronisation automatique à la reconnexion.");
        } catch (e) {
          flash(e instanceof Error ? e.message : "Impossible d’enfiler la commande hors ligne.");
        }
      return;
    }

      try {
        const clientMutationId =
          typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`;
        const data = await getAppApi().orders.create(buildOrderCreateBody({ ...body, clientMutationId }));
        if (isKitchenSendIncomplete(data)) {
          flash(kitchenSendFailureMessage(data));
          return;
        }
        hydrateFromOrderDetail(data);
        completeKitchenSendSuccess("Commande créée et envoyée en cuisine.");
        void qc.invalidateQueries({ queryKey: queryKeys.tables.layout() });
        if (resolvedTableId) void qc.invalidateQueries({ queryKey: queryKeys.pos.tableBootstrap(resolvedTableId) });
      } catch (err: unknown) {
        console.error("FULL ORDER ERROR:", err);

        const e = err as { details?: unknown; response?: { data?: unknown } };
        const details =
          e?.details ||
          (e?.response?.data as { details?: unknown })?.details ||
          (e?.response?.data as { errors?: unknown })?.errors ||
          e?.response?.data ||
          err;

        flash(JSON.stringify(details, null, 2).slice(0, 250));
      }
    } finally {
      kitchenFlightRef.current = false;
      setKitchenSending(false);
    }
  };

  const hasMenuData = categories.length > 0 || items.length > 0;
  const menuLoading = menuQuery.isPending && !hasMenuData;
  const menuError = menuQuery.isError && !hasMenuData;
  const menuErr = menuQuery.error;
  const showDegradedBanner = menuQuery.isError && hasMenuData;

  return (
    <PageQueryState
      label="le menu"
      isLoading={menuLoading}
      isError={menuError}
      error={menuErr}
      isEmpty={false}
      onRetry={() => void menuQuery.refetch()}
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent", className)}
      showLoadingOverlay={menuQuery.isFetching && hasMenuData}
    >
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {editingTakeawayLabel ? (
        <p
          className="shrink-0 rounded-lg border border-violet-500/30 bg-violet-950/40 px-3 py-2 text-sm font-medium text-violet-100"
          role="status"
        >
          {fr.pos.editingTakeaway(editingTakeawayLabel)}
        </p>
      ) : null}

      {showDegradedBanner ? (
        <div
          className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-100"
          role="status"
        >
          <span>{fr.dashboard.dashboardLoadError}</span>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => void menuQuery.refetch()}>
            {fr.dashboard.retry}
          </Button>
        </div>
      ) : null}
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-[100] max-w-md -translate-x-1/2 rounded-xl border border-pos-border-subtle bg-pos-depth/95 px-4 py-3 text-center text-sm font-semibold text-foreground shadow-surface-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden">
        <PosSearchBar value={search} onChange={setSearch} filterActiveCount={search.trim() ? 1 : 0} />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
            <PosCategoryRail
              categories={categoryTabs}
              activeId={activeCategoryId}
              onSelect={setActiveCategoryId}
              className="h-full min-h-0 shrink-0"
            />

            <PosProductGrid
              popular={popularCards}
              categoryTitle={categoryTitle}
              categoryCount={filteredItems.length}
              products={gridCards}
              onQuickAdd={handleQuickAdd}
              onCustomize={handleCustomize}
              className="h-full min-h-0 min-w-0 flex-1 xl:border-r xl:border-pos-border-subtle"
            />

            <PosOrderPanel
              className="hidden h-full min-h-0 overflow-hidden xl:flex xl:w-96 xl:shrink-0 xl:flex-col"
              lines={panelLines}
              itemCount={totals.itemCount}
              totalLabel={totalLabel}
              onIncrementQty={handleIncrementQty}
              onDecrementQty={handleDecrementQty}
              onRemoveLine={handleRemoveLine}
              onSetLineNotes={handleSetLineNotes}
              orderType={orderType}
              onOrderTypeChange={setOrderType}
              waiterName={waiterName}
              onWaiterNameChange={setWaiterName}
              tableNumber={tableNumber}
              onTableNumberChange={setTableNumber}
              dineInTableLockedLabel={dineInLockedLabel}
              sendDisabled={
                orderType === "takeaway"
                  ? takeawaySendDisabled
                  : lines.length === 0 ||
                    (!activeOrderId && !tableId && !tableNumber.trim()) ||
                    (Boolean(activeOrderId) && !canSendToKitchen)
              }
              sendLoading={kitchenSending}
              lockOrderType={takeawayEditLocked}
              sendLabel={panelSendLabel}
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
          className="flex h-full max-h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-card p-0 shadow-surface-lg sm:max-w-md"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Commande</SheetTitle>
          </SheetHeader>
          <PosOrderPanel
            className="flex h-full min-h-0 max-h-full flex-1 flex-col overflow-hidden border-0"
            lines={panelLines}
            itemCount={totals.itemCount}
            totalLabel={totalLabel}
            onIncrementQty={handleIncrementQty}
            onDecrementQty={handleDecrementQty}
            onRemoveLine={handleRemoveLine}
            onSetLineNotes={handleSetLineNotes}
            orderType={orderType}
            onOrderTypeChange={setOrderType}
            waiterName={waiterName}
            onWaiterNameChange={setWaiterName}
            tableNumber={tableNumber}
            onTableNumberChange={setTableNumber}
            dineInTableLockedLabel={dineInLockedLabel}
            sendDisabled={
              orderType === "takeaway"
                ? takeawaySendDisabled
                : lines.length === 0 ||
                  (!activeOrderId && !tableId && !tableNumber.trim()) ||
                  (Boolean(activeOrderId) && !canSendToKitchen)
            }
            sendLoading={kitchenSending}
            lockOrderType={takeawayEditLocked}
            sendLabel={panelSendLabel}
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
    </PageQueryState>
  );
}
