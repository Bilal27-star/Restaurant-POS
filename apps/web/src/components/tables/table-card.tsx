import { Clock, MoreVertical, Pencil, Printer, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import { encodeTableDragPayload, TABLE_DRAG_MIME } from "./table-dnd";
import type { RestaurantTable } from "./tables-demo-data";
import { orderDisplayRef } from "./tables-demo-data";

export interface TableCardProps {
  table: RestaurantTable;
  /** Floor this card is rendered on — used for drag payload. */
  floorId: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Occupied table with order — primary tap opens table order details. */
  onOccupiedPress?: () => void;
  /** Occupied tables only — print table identification ticket (thermal-friendly). */
  onPrintTicket?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isDragging?: boolean;
  onTableDragStart?: () => void;
  onTableDragEnd?: () => void;
}

export function TableCard({
  table,
  floorId,
  selected,
  onSelect,
  onOccupiedPress,
  onPrintTicket,
  onEdit,
  onDelete,
  isDragging,
  onTableDragStart,
  onTableDragEnd,
}: TableCardProps) {
  const { status } = table;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuWrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = (ev: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(ev.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const shell = cn(
    "group/table relative flex min-h-[17rem] flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 pb-4 shadow-surface-md ring-1 ring-white/[0.06]",
    "transition-[transform,box-shadow,border-color,opacity] duration-200 ease-out motion-reduce:transition-none",
    "cursor-grab active:cursor-grabbing",
    isDragging && "scale-[0.985] opacity-60",
    "hover:-translate-y-0.5 hover:shadow-surface-hover motion-reduce:hover:translate-y-0",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    status === "free" && "border-l-4 border-l-emerald-500 hover:border-emerald-600/35",
    status === "occupied" && "border-l-4 border-l-fuchsia-600 hover:border-fuchsia-600/35",
    status === "reserved" && "border-l-4 border-l-amber-500 hover:border-amber-600/35",
    selected && "ring-2 ring-primary/35 ring-offset-2 ring-offset-background",
  );

  const dotFill =
    status === "free" ? "bg-emerald-500" : status === "occupied" ? "bg-fuchsia-600" : "bg-amber-500";

  const dotRing = selected ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : "ring-2 ring-zinc-600";

  const pillClass =
    status === "free"
      ? "border border-emerald-500/35 bg-emerald-500/12 text-emerald-200 transition-colors duration-200 group-hover/table:bg-emerald-500/18"
      : status === "occupied"
        ? "border border-fuchsia-500/35 bg-fuchsia-500/12 text-fuchsia-200 transition-colors duration-200 group-hover/table:bg-fuchsia-500/18"
        : "border border-amber-500/35 bg-amber-500/12 text-amber-200 transition-colors duration-200 group-hover/table:bg-amber-500/18";

  const handleDragStart = (e: React.DragEvent) => {
    setMenuOpen(false);
    const payload = encodeTableDragPayload({ tableId: table.id, fromFloorId: floorId });
    e.dataTransfer.setData(TABLE_DRAG_MIME, payload);
    e.dataTransfer.setData("text/plain", payload);
    e.dataTransfer.effectAllowed = "move";
    onTableDragStart?.();
  };

  const statusLabel =
    status === "free" ? fr.tableCard.free : status === "occupied" ? fr.tableCard.occupied : fr.tableCard.reserved;

  return (
    <article
      role="button"
      tabIndex={0}
      draggable
      aria-grabbed={isDragging}
      aria-pressed={selected}
      aria-selected={selected}
      data-selected={selected ? "" : undefined}
      aria-label={fr.aria.tableCard(table.numberLabel, statusLabel, Boolean(selected))}
      className={shell}
      onClick={() => {
        if (menuOpen) return;
        if (status === "occupied" && table.order) {
          onOccupiedPress?.();
        }
        onSelect?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (menuOpen) return;
          if (status === "occupied" && table.order) {
            onOccupiedPress?.();
          }
          onSelect?.();
        }
      }}
      onDragStart={handleDragStart}
      onDragEnd={() => onTableDragEnd?.()}
    >
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-4xl font-bold tabular-nums tracking-tight text-foreground">{table.numberLabel}</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-caption-foreground">{fr.common.table}</p>
        </div>
        <div ref={menuWrapRef} className="relative flex items-center gap-2">
          <span
            className={cn(
              "h-3 w-3 shrink-0 rounded-full transition-transform duration-200 ease-out group-hover/table:scale-110 motion-reduce:group-hover/table:scale-100",
              dotFill,
              dotRing,
              selected && "scale-110",
            )}
            aria-hidden
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            draggable={false}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="size-9 shrink-0 rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            aria-label={fr.aria.tableActions}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <MoreVertical className="size-4" />
          </Button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 min-w-[11.5rem] overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-app-soft ring-1 ring-slate-900/[0.04] animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit?.();
                }}
              >
                <Pencil className="size-4 text-muted-foreground" aria-hidden />
                {fr.tableCard.editTable}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete?.();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                {fr.tableCard.deleteTable}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative mt-4">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
            pillClass,
            selected && "ring-1 ring-primary/25",
          )}
        >
          {status === "free" && fr.tableCard.free}
          {status === "occupied" && fr.tableCard.occupied}
          {status === "reserved" && fr.tableCard.reserved}
        </span>
      </div>

      <div className="relative mt-5 min-h-0 flex-1">
        {status === "occupied" && table.order ? (
          <dl className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <dt>{fr.tableCard.order}</dt>
              <dd className="font-semibold tabular-nums text-fuchsia-700">{orderDisplayRef(table.order)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <dt>{fr.tableCard.items}</dt>
              <dd className="font-medium tabular-nums text-foreground">{table.order.items}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <dt>{fr.tableCard.guests}</dt>
              <dd className="font-medium tabular-nums text-foreground">{table.order.guests}</dd>
            </div>
            <div className="pt-1">
              <p className="text-2xl font-bold tabular-nums text-foreground">{table.order.totalLabel}</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="size-3.5 shrink-0 text-caption-foreground" aria-hidden />
                <span>{table.order.elapsedLabel}</span>
              </div>
              {onPrintTicket ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  draggable={false}
                  aria-label={fr.tableCard.printTicketAria}
                  className="h-8 shrink-0 gap-1.5 rounded-lg border-fuchsia-500/30 bg-fuchsia-500/[0.08] px-2.5 text-xs font-semibold text-fuchsia-100 shadow-none hover:bg-fuchsia-500/15 hover:text-fuchsia-50"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrintTicket();
                  }}
                >
                  <Printer className="size-3.5" aria-hidden />
                  {fr.tableCard.printTicket}
                </Button>
              ) : null}
            </div>
          </dl>
        ) : null}

        {status === "free" ? (
          <div className="pt-6 text-center">
            {typeof table.capacity === "number" ? (
              <p className="text-xs font-medium tabular-nums text-caption-foreground">
                {fr.tableCard.upToGuests(table.capacity)}
              </p>
            ) : null}
            <p
              className={cn(
                "text-sm font-medium text-muted-foreground transition-colors group-hover/table:text-foreground",
                typeof table.capacity === "number" ? "mt-2" : "",
              )}
            >
              {fr.tableCard.tapStart}
            </p>
          </div>
        ) : null}

        {status === "reserved" ? (
          <div className="pt-6">
            <p className="text-center text-sm font-medium text-amber-900">{table.reservedNote ?? fr.tableCard.reserved}</p>
            <p className="mt-2 text-center text-xs text-muted-foreground">{fr.tableCard.reservedHold}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
