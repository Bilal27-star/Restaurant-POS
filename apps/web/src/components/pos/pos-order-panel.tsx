import { Minus, Plus, Send, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fr } from "@/lib/locale/fr";
import type { PosCartLineItem } from "./pos-cart-types";
import { PosCartLineKitchenNote } from "./pos-kitchen-note";
import { formatDa } from "./pos-customization-pricing";
import { PosTakeawayCustomerSection, type PosTakeawayCustomerSectionProps } from "./pos-takeaway-customer-section";

export type PosOrderType = "dine-in" | "takeaway";

export type PosTakeawayCustomerFlowProps = PosTakeawayCustomerSectionProps;

export interface PosOrderPanelProps {
  className?: string;
  lines: PosCartLineItem[];
  itemCount: number;
  totalLabel: string;
  onIncrementQty: (lineId: string) => void;
  onDecrementQty: (lineId: string) => void;
  onRemoveLine: (lineId: string) => void;
  onSetLineNotes: (lineId: string, notes: string) => void;
  orderType: PosOrderType;
  onOrderTypeChange: (t: PosOrderType) => void;
  waiterName: string;
  onWaiterNameChange: (v: string) => void;
  tableNumber: string;
  onTableNumberChange: (v: string) => void;
  /** When set, dine-in table is fixed (e.g. opened from `/orders?tableId=…`). */
  dineInTableLockedLabel?: string | null;
  /** Extra disable rules (e.g. active order with no new lines). */
  sendDisabled?: boolean;
  /** While the kitchen / sync request is in flight (double-submit guard). */
  sendLoading?: boolean;
  takeawayCustomer: PosTakeawayCustomerSectionProps;
  onSendToKitchen: () => void;
}

function customizationSummary(line: PosCartLineItem): string {
  const removed = line.ingredients.filter((i) => !i.included).map((i) => i.label);
  const parts: string[] = [];
  if (removed.length) parts.push(`Sans ${removed.join(", ")}`);
  if (line.extras.length) parts.push(line.extras.map((e) => e.label).join(" · "));
  return parts.join(" · ") || "Standard";
}

const panelEase = "ease-[cubic-bezier(0.22,1,0.36,1)]";

export function PosOrderPanel({
  className,
  lines,
  itemCount,
  totalLabel,
  onIncrementQty,
  onDecrementQty,
  onRemoveLine,
  onSetLineNotes,
  orderType,
  onOrderTypeChange,
  waiterName,
  onWaiterNameChange,
  tableNumber,
  onTableNumberChange,
  dineInTableLockedLabel,
  sendDisabled = false,
  sendLoading = false,
  takeawayCustomer,
  onSendToKitchen,
}: PosOrderPanelProps) {
  const isTakeaway = orderType === "takeaway";

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden border-pos-border-subtle bg-pos-depth/50 backdrop-blur-xl xl:w-96 xl:border-l",
        className,
      )}
      aria-label="Panier et commande"
    >
      <div className="shrink-0 border-b border-pos-border-subtle px-5 pb-2 pt-5">
        <h2 className="text-xl font-bold tracking-tight text-pos-neon-magenta">Commande</h2>
        <p className="mt-1.5 text-sm font-medium text-muted-foreground">{itemCount} articles</p>
        {waiterName.trim() ? (
          <p className="mt-1 text-xs font-medium text-foreground/80">Serveur : {waiterName.trim()}</p>
        ) : null}
      </div>

      <div className="shrink-0 border-b border-pos-border-subtle px-4 pb-3 pt-1">
        <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Nom du serveur
        </label>
        <Input
          value={waiterName}
          onChange={(e) => onWaiterNameChange(e.target.value)}
          placeholder="Optionnel"
          className="mt-1.5 h-11 border-pos-border-subtle bg-pos-glass text-[15px]"
          aria-label="Nom du serveur"
        />
      </div>

      <div className="shrink-0 border-b border-pos-border-subtle p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-12 min-h-12 rounded-xl border text-sm font-semibold transition-all duration-300",
              panelEase,
              orderType === "dine-in"
                ? "border-transparent bg-gradient-to-r from-[#7c3aed] to-[#db2777] text-white shadow-[0_0_24px_rgba(219,39,119,0.45)] hover:text-white"
                : "border-pos-border-subtle bg-pos-glass text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            onClick={() => onOrderTypeChange("dine-in")}
          >
            <span className="mr-1.5" aria-hidden>
              🍽️
            </span>
            Dine-in
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-12 min-h-12 rounded-xl border text-sm font-semibold transition-all duration-300",
              panelEase,
              orderType === "takeaway"
                ? "border-transparent bg-gradient-to-r from-[#7c3aed] to-[#db2777] text-white shadow-[0_0_24px_rgba(219,39,119,0.45)] hover:text-white"
                : "border-pos-border-subtle bg-pos-glass text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            onClick={() => onOrderTypeChange("takeaway")}
          >
            <span className="mr-1.5" aria-hidden>
              🛍️
            </span>
            Takeaway
          </Button>
        </div>
      </div>

      {orderType === "dine-in" ? (
        <div className="shrink-0 border-b border-pos-border-subtle px-4 pb-3 pt-1">
          <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Sur place</label>
          {dineInTableLockedLabel ? (
            <div className="mt-1.5 flex h-11 items-center rounded-lg border border-pos-border-subtle bg-pos-glass/80 px-3 text-[15px] font-semibold text-foreground">
              {dineInTableLockedLabel}
            </div>
          ) : (
            <Input
              value={tableNumber}
              onChange={(e) => onTableNumberChange(e.target.value)}
              placeholder="Numéro de table"
              className="mt-1.5 h-11 border-pos-border-subtle bg-pos-glass text-[15px]"
              aria-label="Numéro de table"
            />
          )}
        </div>
      ) : null}

      {/* Middle: customer (takeaway) + cart lines — sole scroll region; footer stays pinned. */}
      <div className="pos-order-panel-scroll scrollbar-pos-modal flex flex-col">
        {isTakeaway ? (
          <div className="shrink-0 border-b border-pos-border-subtle px-4 pb-3 pt-1">
            <PosTakeawayCustomerSection {...takeawayCustomer} />
          </div>
        ) : null}

        <div className="shrink-0 px-3 py-3">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30 text-muted-foreground">
                <ShoppingCart className="h-8 w-8" aria-hidden />
              </div>
              <p className="mt-4 text-sm font-medium text-muted-foreground">Panier vide</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="rounded-xl border border-white/[0.06] bg-pos-glass/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight text-foreground">{line.name}</p>
                      {line.notes.trim() ? (
                        <p
                          className="mt-1 border-l-2 border-violet-400/55 pl-2 text-xs italic leading-snug text-violet-100/95 shadow-[0_0_12px_rgba(167,139,250,0.12)]"
                          title={line.notes}
                        >
                          {line.notes}
                        </p>
                      ) : null}
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{customizationSummary(line)}</p>
                      <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                        {formatDa(line.unitPriceDa)} <span className="text-muted-foreground/70">×</span> {line.quantity}
                      </p>
                      {line.notesEditable ? (
                        <PosCartLineKitchenNote notes={line.notes} onNotesChange={(n) => onSetLineNotes(line.id, n)} />
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={line.readOnly}
                      className="size-8 shrink-0 text-muted-foreground hover:bg-red-500/15 hover:text-red-300 disabled:opacity-30"
                      aria-label={`Retirer ${line.name}`}
                      onClick={() => onRemoveLine(line.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="surface-dark-ink inline-flex items-center rounded-lg border border-white/[0.08] bg-zinc-900/50 p-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={line.readOnly}
                        className="size-9 rounded-md text-on-dark-secondary hover:bg-white/10 hover:text-on-dark-title disabled:opacity-30"
                        aria-label="Diminuer quantité"
                        onClick={() => onDecrementQty(line.id)}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="min-w-[2rem] text-center text-sm font-bold tabular-nums text-on-dark-title">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={line.readOnly}
                        className="size-9 rounded-md text-on-dark-secondary hover:bg-white/10 hover:text-on-dark-title disabled:opacity-30"
                        aria-label="Augmenter quantité"
                        onClick={() => onIncrementQty(line.id)}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <span className="text-base font-bold tabular-nums text-pos-neon-magenta">
                      {formatDa(line.lineTotalDa)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-pos-border-subtle bg-pos-depth/80 p-5">
        <div className="flex items-end justify-between gap-4">
          <span className="text-base font-medium text-foreground">Total</span>
          <span className="text-3xl font-bold tabular-nums tracking-tight text-pos-neon-magenta">{totalLabel}</span>
        </div>
        <Button
          type="button"
          disabled={lines.length === 0 || sendDisabled || sendLoading}
          className="mt-4 h-14 min-h-14 w-full rounded-xl border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] text-base font-semibold text-white shadow-[0_8px_28px_rgba(219,39,119,0.35)] hover:from-[#8b5cf6] hover:to-[#ec4899] disabled:opacity-40"
          onClick={onSendToKitchen}
        >
          <Send className="mr-2 h-5 w-5 shrink-0" aria-hidden />
          {sendLoading ? fr.pos.sendKitchenLoading : fr.pos.sendKitchen}
        </Button>
      </div>
    </aside>
  );
}
