import { Building2, Layers, Plus, Search } from "lucide-react";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/auth-context";
import { AddFloorModal } from "@/components/tables/add-floor-modal";
import { AddTableModal } from "@/components/tables/add-table-modal";
import { DeleteTableDialog } from "@/components/tables/delete-table-dialog";
import { TableAddItemsSheet } from "@/components/tables/table-add-items-sheet";
import { TableDetailsModal } from "@/components/tables/table-details-modal";
import { parseTableDragPayload } from "@/components/tables/table-dnd";
import { TableCard } from "@/components/tables/table-card";
import {
  type FloorDef,
  type RestaurantTable,
  type TableStatus,
  orderDisplayRef,
} from "@/components/tables/table-types";
import { printTableIdentificationTicket } from "@/lib/tickets/table-ticket-print";
import { PageQueryState } from "@/components/data/page-query-state";
import { PageShell } from "@/components/data/page-shell";
import { usePageRouteDiagnostics } from "@/hooks/use-page-route-diagnostics";
import { useTablesFloorsState } from "@/components/tables/use-tables-floors-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildAddOrderLinesBody } from "@/components/pos/pos-order-cart-adapter";
import { getAppApi } from "@/lib/app-api";
import { mapTablesLayoutPayload } from "@/lib/map-tables-layout";
import { findTableIdInLayout, syncTablesLayoutQueryData } from "@/lib/tables-layout-cache";
import { queryKeys } from "@/lib/query-keys";
import { useTablesLayoutQuery } from "@/lib/use-tables-layout-query";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | TableStatus;

type FormModalState = { type: "add" } | { type: "edit"; table: RestaurantTable; floorId: string };

function countByStatus(tables: RestaurantTable[]) {
  let free = 0;
  let occupied = 0;
  let reserved = 0;
  for (const t of tables) {
    if (t.status === "free") free += 1;
    else if (t.status === "occupied") occupied += 1;
    else reserved += 1;
  }
  return { free, occupied, reserved, total: tables.length };
}

function floorOccupiedTotal(floor: FloorDef) {
  const occ = floor.tables.filter((t) => t.status === "occupied").length;
  return `${occ}/${floor.tables.length}`;
}

export function TablesPage() {
  usePageRouteDiagnostics("tables");
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const layoutQuery = useTablesLayoutQuery();
  const { floors: storeFloors, moveTable } = useTablesFloorsState();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverFloorId, setDragOverFloorId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  const [dropAppend, setDropAppend] = useState(false);
  const mappedFromQuery = useMemo(
    () => (layoutQuery.data !== undefined ? mapTablesLayoutPayload(layoutQuery.data) : undefined),
    [layoutQuery.data],
  );
  /** During drag, Zustand holds optimistic positions; otherwise the server layout is authoritative. */
  const floors = useMemo(() => {
    if (draggingId && storeFloors.length > 0) return storeFloors;
    if (layoutQuery.isSuccess && mappedFromQuery !== undefined) return mappedFromQuery;
    return storeFloors;
  }, [draggingId, storeFloors, layoutQuery.isSuccess, mappedFromQuery]);
  const [floorId, setFloorId] = useState("");
  useEffect(() => {
    if (!floorId && floors[0]) {
      setFloorId(floors[0].id);
    }
  }, [floorId, floors]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formModal, setFormModal] = useState<FormModalState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ table: RestaurantTable; floorId: string } | null>(null);

  const [tableDetailsOpen, setTableDetailsOpen] = useState(false);
  const [tableDetailsTarget, setTableDetailsTarget] = useState<{ floorId: string; table: RestaurantTable } | null>(
    null,
  );
  const [addItemsOpen, setAddItemsOpen] = useState(false);
  const [addItemsSheetKey, setAddItemsSheetKey] = useState(0);
  const [addFloorOpen, setAddFloorOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const persistTableFloor = useCallback(
    async (tableId: string, newFloorId: string) => {
      try {
        const layout = await getAppApi().tables.patchTable(tableId, { floorId: newFloorId });
        syncTablesLayoutQueryData(qc, layout);
      } catch {
        flash("Impossible de déplacer la table (serveur).");
        await layoutQuery.refetch();
      }
    },
    [qc, flash, layoutQuery],
  );

  const closeTableDetails = useCallback(() => {
    setTableDetailsOpen(false);
    setTableDetailsTarget(null);
  }, []);

  const openOccupiedDetails = useCallback((fid: string, table: RestaurantTable) => {
    if (table.status !== "occupied" || !table.order) return;
    setTableDetailsTarget({ floorId: fid, table });
    setTableDetailsOpen(true);
  }, []);

  const handlePrintTableTicket = useCallback(
    (fid: string, table: RestaurantTable) => {
      if (!table.order) return;
      const order = table.order;
      const ok = printTableIdentificationTicket({
        restaurantName: fr.tables.ticketRestaurantName,
        tableDisplay: `T${table.numberLabel}`,
        orderDisplay: orderDisplayRef(order),
        waiterName: order.waiterName?.trim() || fr.tables.ticketUnknownWaiter,
        printedAt: new Date(),
        ticketPublicCode: order.ticketPublicCode,
        qrPayload: {
          v: 1,
          restaurantId: user?.restaurantId ?? "",
          orderId: order.id,
          orderNumber: order.orderNumber,
          ticketPublicCode: order.ticketPublicCode,
          tableNumberLabel: table.numberLabel,
        },
      });
      void qc.invalidateQueries({ queryKey: queryKeys.tables.layout() });
      flash(ok ? fr.tables.toastTicketPrinted : fr.tables.toastPrintBlocked);
    },
    [flash, user?.restaurantId, qc],
  );

  const ignoreFloorClickUntilRef = React.useRef(0);

  const activeFloor: FloorDef = floors.find((f) => f.id === floorId) ?? floors[0] ?? { id: "", name: "", tables: [] };

  const filteredTables = useMemo(() => {
    let list = activeFloor.tables;
    if (filter !== "all") {
      list = list.filter((t) => t.status === filter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => t.numberLabel.toLowerCase().includes(q));
    }
    return list;
  }, [activeFloor.tables, filter, query]);

  const counts = countByStatus(activeFloor.tables);

  const endDragVisuals = React.useCallback(() => {
    setDraggingId(null);
    setDragOverFloorId(null);
    setDropBeforeId(null);
    setDropAppend(false);
    ignoreFloorClickUntilRef.current = Date.now() + 220;
  }, []);

  const handleFloorClick = (id: string) => {
    if (Date.now() < ignoreFloorClickUntilRef.current) return;
    setFloorId(id);
    setSelectedId(null);
  };

  const handleDropOnFloorTab = async (e: React.DragEvent, targetFloorId: string) => {
    e.preventDefault();
    const p = parseTableDragPayload(e.dataTransfer);
    if (!p) return;
    moveTable({
      fromFloorId: p.fromFloorId,
      tableId: p.tableId,
      toFloorId: targetFloorId,
      insertBeforeId: null,
    });
    setFloorId(targetFloorId);
    setSelectedId(p.tableId);
    if (p.fromFloorId !== targetFloorId) {
      await persistTableFloor(p.tableId, targetFloorId);
    }
    endDragVisuals();
  };

  const handleDropBeforeCard = async (e: React.DragEvent, insertBeforeId: string) => {
    e.preventDefault();
    const p = parseTableDragPayload(e.dataTransfer);
    if (!p) return;
    if (p.tableId === insertBeforeId) {
      endDragVisuals();
      return;
    }
    moveTable({
      fromFloorId: p.fromFloorId,
      tableId: p.tableId,
      toFloorId: floorId,
      insertBeforeId,
    });
    setSelectedId(p.tableId);
    if (p.fromFloorId !== floorId) {
      await persistTableFloor(p.tableId, floorId);
    }
    endDragVisuals();
  };

  const handleDropAppend = async (e: React.DragEvent) => {
    e.preventDefault();
    const p = parseTableDragPayload(e.dataTransfer);
    if (!p) return;
    moveTable({
      fromFloorId: p.fromFloorId,
      tableId: p.tableId,
      toFloorId: floorId,
      insertBeforeId: null,
    });
    setSelectedId(p.tableId);
    if (p.fromFloorId !== floorId) {
      await persistTableFloor(p.tableId, floorId);
    }
    endDragVisuals();
  };

  const handleDragLeaveCard = (e: React.DragEvent, tableId: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDropBeforeId((id) => (id === tableId ? null : id));
  };

  const deleteFloorName = deleteTarget ? floors.find((f) => f.id === deleteTarget.floorId)?.name : undefined;

  const hasLayoutData = floors.length > 0;
  const layoutLoading = layoutQuery.isPending && !hasLayoutData;
  const layoutError = layoutQuery.isError && !hasLayoutData;
  const showDegradedBanner = layoutQuery.isError && hasLayoutData;

  return (
    <PageShell fill>
    <PageQueryState
      label="le plan de salle"
      isLoading={layoutLoading}
      isError={layoutError}
      error={layoutQuery.error}
      isEmpty={false}
      onRetry={() => void layoutQuery.refetch()}
      className="relative isolate min-h-0 flex-1"
      showLoadingOverlay={layoutQuery.isFetching && floors.length > 0}
    >
    <div className="relative isolate flex min-h-0 flex-1 flex-col">
      {showDegradedBanner ? (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-sm text-amber-100"
          role="status"
        >
          <span>Impossible de rafraîchir le plan de salle. Les données affichées peuvent être obsolètes.</span>
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => void layoutQuery.refetch()}>
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

      {/* Toolbar — Figma: floors + search + filters + add */}
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap gap-2">
          {floors.map((floor) => {
            const active = floor.id === floorId;
            const isDropFloor = dragOverFloorId === floor.id;
            return (
              <div
                key={floor.id}
                className={cn(
                  "rounded-xl transition-[box-shadow,transform] duration-200 ease-out",
                  isDropFloor && "ring-2 ring-violet-400/70 ring-offset-2 ring-offset-[#0b0616] scale-[1.02]",
                )}
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverFloorId(floor.id);
                }}
                onDragLeave={(e) => {
                  const related = e.relatedTarget as Node | null;
                  if (related && e.currentTarget.contains(related)) return;
                  setDragOverFloorId((id) => (id === floor.id ? null : id));
                }}
                onDrop={(e) => handleDropOnFloorTab(e, floor.id)}
              >
                <Button
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="lg"
                  className={cn(
                    "h-12 min-h-12 gap-2 rounded-xl px-5 text-base font-semibold touch-manipulation",
                    active &&
                      "border-transparent bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_8px_28px_rgba(139,92,246,0.35)] hover:from-violet-500 hover:to-fuchsia-500",
                    !active &&
                      "border-white/[0.1] bg-purple-950/25 text-on-dark-title backdrop-blur-sm hover:bg-purple-950/40",
                  )}
                  onClick={() => handleFloorClick(floor.id)}
                >
                  <Layers className="size-[18px] shrink-0 opacity-90" aria-hidden />
                  {floor.name}
                  <span
                    className={cn(
                      "ml-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                      active ? "bg-white/15 text-white" : "bg-white/[0.06] text-on-dark-label",
                    )}
                  >
                    {floorOccupiedTotal(floor)}
                  </span>
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:max-w-none">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs lg:w-64 lg:flex-none">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-on-dark-label"
              aria-hidden
            />
            <Input
              placeholder={fr.tables.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 min-h-12 rounded-xl border-white/[0.08] bg-purple-950/30 pl-10 text-base text-on-dark-table placeholder:text-on-dark-placeholder backdrop-blur-md"
              aria-label={fr.aria.searchTables}
            />
          </div>

          <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-purple-950/20 p-1 backdrop-blur-md">
            {(
              [
                ["all", fr.tables.filters.all],
                ["free", fr.tables.filters.free],
                ["occupied", fr.tables.filters.occupied],
                ["reserved", fr.tables.filters.reserved],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold touch-manipulation sm:flex-none sm:px-4",
                  filter === key
                    ? "bg-white/[0.12] text-on-dark-title shadow-inner"
                    : "text-on-dark-secondary hover:bg-white/[0.06] hover:text-on-dark-title",
                )}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 min-h-12 shrink-0 whitespace-nowrap rounded-xl border-white/[0.1] bg-purple-950/25 px-4 text-base font-semibold text-on-dark-title backdrop-blur-sm touch-manipulation hover:bg-purple-950/40 sm:px-5"
            onClick={() => setAddFloorOpen(true)}
          >
            <Building2 className="size-[18px]" aria-hidden />
            {fr.tables.addRoom}
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={floors.length === 0}
            className="h-12 min-h-12 shrink-0 whitespace-nowrap rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-base font-semibold text-white shadow-[0_8px_28px_rgba(139,92,246,0.35)] touch-manipulation hover:from-violet-500 hover:to-fuchsia-500 disabled:pointer-events-none disabled:opacity-45 sm:px-5"
            onClick={() => setFormModal({ type: "add" })}
          >
            <Plus className="size-[18px]" aria-hidden />
            {fr.tables.addTable}
          </Button>
        </div>
      </div>

      {/* Legend — Figma summary row */}
      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <span className="size-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]" aria-hidden />
          <span>
            {fr.tables.legendFree}: <strong className="font-semibold text-foreground">{counts.free}</strong>
          </span>
        </span>
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <span className="size-3 rounded-full bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,0.45)]" aria-hidden />
          <span>
            {fr.tables.legendOccupied}: <strong className="font-semibold text-foreground">{counts.occupied}</strong>
          </span>
        </span>
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <span className="size-3 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.45)]" aria-hidden />
          <span>
            {fr.tables.legendReserved}: <strong className="font-semibold text-foreground">{counts.reserved}</strong>
          </span>
        </span>
        <span className="text-muted-foreground">
          {fr.tables.legendTotal}:{" "}
          <strong className="font-semibold text-foreground">
            {counts.total} {fr.tables.tablesWord}
          </strong>
        </span>
        <span className="w-full text-xs text-muted-foreground/90 sm:ml-auto sm:w-auto">
          {fr.tables.dragHint}
        </span>
      </div>

      {/* Grid — fluid columns ~ Figma card width */}
      {activeFloor.tables.length > 0 ? (
        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4 md:gap-5">
          {filteredTables.map((table) => (
            <div
              key={table.id}
              className="relative"
              onDragOver={(e) => {
                if (!draggingId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDropBeforeId(table.id);
                setDropAppend(false);
              }}
              onDragLeave={(e) => handleDragLeaveCard(e, table.id)}
              onDrop={(e) => handleDropBeforeCard(e, table.id)}
            >
              {dropBeforeId === table.id && draggingId && draggingId !== table.id ? (
                <div
                  className="pointer-events-none absolute -top-3 left-2 right-2 z-10 h-1 rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-400 shadow-[0_0_20px_rgba(167,139,250,0.8)] animate-in fade-in zoom-in-95 duration-150"
                  aria-hidden
                />
              ) : null}
              <TableCard
                floorId={floorId}
                table={table}
                selected={selectedId === table.id}
                isDragging={draggingId === table.id}
                onSelect={() => setSelectedId((id) => (id === table.id ? null : table.id))}
                onOccupiedPress={() => openOccupiedDetails(floorId, table)}
                onPrintTicket={
                  table.status === "occupied" && table.order
                    ? () => handlePrintTableTicket(floorId, table)
                    : undefined
                }
                onEdit={() => setFormModal({ type: "edit", table, floorId })}
                onDelete={() => setDeleteTarget({ table, floorId })}
                onTableDragStart={() => setDraggingId(table.id)}
                onTableDragEnd={endDragVisuals}
              />
            </div>
          ))}
        </div>
      ) : null}

      {/* Append drop zone — reorder / move to end of current floor */}
      {filteredTables.length > 0 && draggingId ? (
        <div
          className={cn(
            "mt-4 flex min-h-14 items-center justify-center rounded-xl border border-dashed px-4 py-3 text-center text-sm transition-all duration-200",
            dropAppend
              ? "border-violet-400/60 bg-violet-500/10 text-on-dark-title shadow-[0_0_28px_rgba(139,92,246,0.25)]"
              : "border-white/[0.08] text-on-dark-secondary",
          )}
          onDragOver={(e) => {
            if (!draggingId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropAppend(true);
            setDropBeforeId(null);
          }}
          onDragLeave={(e) => {
            const related = e.relatedTarget as Node | null;
            if (related && e.currentTarget.contains(related)) return;
            setDropAppend(false);
          }}
          onDrop={handleDropAppend}
        >
          {fr.tables.dropEnd}
        </div>
      ) : null}

      {activeFloor.tables.length === 0 ? (
        <div
          className={cn(
            "mt-8 flex min-h-[12rem] flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-10 text-center transition-all duration-200",
            draggingId ? "border-violet-400/45 bg-violet-500/5 shadow-[0_0_40px_rgba(139,92,246,0.15)]" : "border-white/[0.08] bg-purple-950/10",
          )}
          onDragOver={(e) => {
            if (!draggingId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleDropAppend}
        >
          <p className="text-sm font-semibold text-on-dark-title">{fr.tables.emptyFloorTitle}</p>
          <p className="mt-2 max-w-sm text-sm font-medium leading-relaxed text-on-dark-secondary">
            {draggingId ? fr.tables.emptyFloorDrag : fr.tables.emptyFloorHint}
          </p>
        </div>
      ) : null}

      {activeFloor.tables.length > 0 && filteredTables.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          {fr.tables.noMatchFilters}
        </p>
      ) : null}

      <AddFloorModal
        open={addFloorOpen}
        onOpenChange={setAddFloorOpen}
        onSubmit={async (name) => {
          try {
            const layout = await getAppApi().tables.createFloor({ name, sortOrder: floors.length });
            syncTablesLayoutQueryData(qc, layout);
            const mapped = mapTablesLayoutPayload(layout);
            const last = mapped[mapped.length - 1];
            if (last) setFloorId(last.id);
            flash(fr.tables.toastRoomCreated);
          } catch (err) {
            flash(fr.tables.toastRoomError);
            throw err;
          }
        }}
      />

      <AddTableModal
        open={formModal !== null}
        onOpenChange={(open) => {
          if (!open) setFormModal(null);
        }}
        floors={floors}
        defaultFloorId={floorId}
        mode={formModal?.type === "edit" ? "edit" : "add"}
        editContext={formModal?.type === "edit" ? { table: formModal.table, floorId: formModal.floorId } : null}
        onSubmit={async (payload) => {
          try {
            if (payload.mode === "add") {
              const layout = await getAppApi().tables.createTable({
                floorId: payload.floorId,
                number: payload.table.numberLabel,
                capacity: payload.table.capacity ?? 4,
              });
              syncTablesLayoutQueryData(qc, layout);
              setFloorId(payload.floorId);
              const serverId = findTableIdInLayout(layout, payload.floorId, payload.table.numberLabel);
              setSelectedId(serverId ?? null);
              flash(fr.tables.toastTableSaved);
              return;
            }
            const layout = await getAppApi().tables.patchTable(payload.table.id, {
              number: payload.table.numberLabel,
              capacity: payload.table.capacity ?? 4,
              floorId: payload.floorId,
            });
            syncTablesLayoutQueryData(qc, layout);
            setFloorId(payload.floorId);
            setSelectedId(payload.table.id);
            flash(fr.tables.toastTableSaved);
          } catch {
            flash("Impossible d'enregistrer la table.");
            throw new Error("table_save_failed");
          }
        }}
      />

      <DeleteTableDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        table={deleteTarget?.table ?? null}
        floorName={deleteFloorName}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            const layout = await getAppApi().tables.deleteTable(deleteTarget.table.id);
            syncTablesLayoutQueryData(qc, layout);
            setDeleteTarget(null);
            setSelectedId((id) => (id === deleteTarget.table.id ? null : id));
            flash(fr.tables.toastTableDeleted);
          } catch (err: any) {
            if (err && (err.message?.includes("active orders") || err.message?.includes("active order"))) {
              flash("Impossible de supprimer cette table car elle contient des commandes actives.");
            } else {
              flash("Impossible de supprimer la table.");
            }
            throw new Error("table_delete_failed");
          }
        }}
      />

      <TableDetailsModal
        open={tableDetailsOpen}
        onOpenChange={(open) => {
          if (!open) closeTableDetails();
        }}
        table={tableDetailsTarget?.table ?? null}
        onAddItems={() => {
          const t = tableDetailsTarget?.table;
          setTableDetailsOpen(false);
          if (t) {
            navigate(`/orders?tableId=${encodeURIComponent(t.id)}`);
            return;
          }
          setAddItemsSheetKey((k) => k + 1);
          setAddItemsOpen(true);
        }}
        onCheckoutSuccess={async (info) => {
          const target = tableDetailsTarget;
          if (!target) return;
          await qc.invalidateQueries({ queryKey: queryKeys.tables.layout() });
          await qc.invalidateQueries({ queryKey: queryKeys.tables.detail(target.table.id) });
          await qc.invalidateQueries({ queryKey: ["analytics"] });
          await qc.invalidateQueries({ queryKey: queryKeys.pos.tableBootstrap(target.table.id) });
          closeTableDetails();
          const methodLabel = info.method === "cash" ? fr.tables.paymentMethodCash : fr.tables.paymentMethodCard;
          let suffix = "";
          if (info.method === "cash" && info.changeMajorDa > 0) {
            suffix = fr.tables.toastChange(info.changeMajorDa.toLocaleString("fr-FR"));
          } else if (info.method === "cash") {
            suffix = fr.tables.toastExact;
          }
          flash(fr.tables.toastPayment(methodLabel, suffix));
        }}
        onReceiptPrintWarning={() => flash(fr.tables.receiptPrintWarning)}
      />

      <TableAddItemsSheet
        key={addItemsSheetKey}
        open={addItemsOpen}
        onOpenChange={setAddItemsOpen}
        tableLabel={tableDetailsTarget ? `${fr.tables.tableWord} ${tableDetailsTarget.table.numberLabel}` : fr.tables.tableWord}
        onSubmitLines={async (lines) => {
          const target = tableDetailsTarget;
          const order = target?.table.order;
          if (!target || !order) return;
          try {
            await getAppApi().orders.addLines(
              order.id,
              buildAddOrderLinesBody({
                lines: lines.map((l) => ({
                  menuItemId: l.menuItemId,
                  quantity: l.quantity,
                  modifierIds: [] as string[],
                  removedIngredientIds: [] as string[],
                  kitchenNotes: null,
                })),
                ...(order.version != null ? { version: order.version } : {}),
              }),
            );
            await qc.invalidateQueries({ queryKey: queryKeys.tables.layout() });
            await qc.invalidateQueries({ queryKey: queryKeys.tables.detail(order.id) });
            setAddItemsOpen(false);
            setTableDetailsOpen(true);
            flash(fr.tables.toastItemsAdded);
          } catch {
            flash("Impossible d’ajouter les articles à la commande.");
          }
        }}
      />
    </div>
    </PageQueryState>
    </PageShell>
  );
}
