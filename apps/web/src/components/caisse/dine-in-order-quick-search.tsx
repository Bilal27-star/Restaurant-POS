import { ArrowRight, Receipt, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { defaultOrderLinesForDisplay, orderDisplayRef } from "@/components/tables/table-types";
import type { TableOrder } from "@/components/tables/table-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchDineInOrders } from "@/lib/tickets/dine-in-order-lookup";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import { useDineInFloorsStore } from "@/stores/dine-in-floors-store";

function paymentLabel(order: TableOrder): string {
  const s = order.paymentStatus ?? "unpaid";
  if (s === "paid") return fr.caisseDineIn.paid;
  if (s === "partial") return fr.caisseDineIn.partial;
  return fr.caisseDineIn.unpaid;
}

function hitId(h: { floorId: string; table: { id: string } }) {
  return `${h.floorId}:${h.table.id}`;
}

export function DineInOrderQuickSearch() {
  const navigate = useNavigate();
  const floors = useDineInFloorsStore((s) => s.floors);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => searchDineInOrders(floors, query), [floors, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setActiveId(null);
      return;
    }
    if (hits.length === 1) {
      setActiveId(hitId(hits[0]!));
      return;
    }
    if (activeId && !hits.some((h) => hitId(h) === activeId)) {
      setActiveId(null);
    }
  }, [query, hits, activeId]);

  const activeHit = useMemo(() => {
    if (!activeId) return null;
    return hits.find((h) => hitId(h) === activeId) ?? null;
  }, [activeId, hits]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      setActiveId(null);
      return;
    }
    if (e.key === "Enter" && hits.length > 1 && !activeHit) {
      e.preventDefault();
      setActiveId(hitId(hits[0]!));
    }
  };

  const lines = activeHit ? defaultOrderLinesForDisplay(activeHit.order) : [];

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-surface-md ring-1 ring-white/[0.05]",
        "md:p-6",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-fuchsia-600/15 text-fuchsia-200 ring-1 ring-fuchsia-500/25">
            <Receipt className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">{fr.caisseDineIn.title}</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">{fr.caisseDineIn.subtitle}</p>
            <p className="mt-1 text-xs text-caption-foreground">{fr.caisseDineIn.hintKeys}</p>
          </div>
        </div>
      </div>

      <div className="relative mt-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          id="caisse-dine-in-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder={fr.caisseDineIn.placeholder}
          aria-label={fr.caisseDineIn.searchAria}
          autoComplete="off"
          spellCheck={false}
          className="h-14 rounded-xl border-border bg-background pl-11 pr-4 text-base font-medium shadow-inner md:text-lg"
        />
      </div>

      {query.trim() && hits.length === 0 ? (
        <p className="mt-4 text-center text-sm font-medium text-muted-foreground">{fr.caisseDineIn.noMatch}</p>
      ) : null}

      {hits.length > 1 ? (
        <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
          {hits.map((h) => {
            const id = hitId(h);
            const selected = activeId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setActiveId(id)}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors",
                    selected
                      ? "border-fuchsia-500/50 bg-fuchsia-500/10 text-foreground"
                      : "border-transparent bg-card hover:border-border hover:bg-muted/40",
                  )}
                >
                  <span className="text-xs font-semibold uppercase tracking-wide text-caption-foreground">
                    {h.floorName} · {fr.caisseDineIn.table} {h.table.numberLabel}
                  </span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {orderDisplayRef(h.order)} · {h.order.totalLabel}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {fr.caisseDineIn.code} {h.order.ticketPublicCode}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {activeHit ? (
        <div className="mt-5 space-y-4 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/[0.06] p-4 md:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-200/90">
                {activeHit.floorName} · {fr.caisseDineIn.table}{" "}
                <span className="text-base text-foreground">T{activeHit.table.numberLabel}</span>
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
                {orderDisplayRef(activeHit.order)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted-foreground">{fr.caisseDineIn.total}</p>
              <p className="text-2xl font-bold tabular-nums text-foreground">{activeHit.order.totalLabel}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-caption-foreground">{fr.caisseDineIn.payment}</span>{" "}
              <span className="font-semibold text-foreground">{paymentLabel(activeHit.order)}</span>
            </div>
            <div>
              <span className="text-caption-foreground">{fr.caisseDineIn.code}</span>{" "}
              <span className="font-mono font-semibold tracking-wide text-foreground">
                {activeHit.order.ticketPublicCode}
              </span>
            </div>
            <div>
              <span className="text-caption-foreground">{fr.caisseDineIn.lastPrint}</span>{" "}
              <span className="font-medium text-foreground">
                {activeHit.order.lastTicketPrintedAtMs
                  ? new Date(activeHit.order.lastTicketPrintedAtMs).toLocaleString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                    })
                  : fr.caisseDineIn.neverPrinted}
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-caption-foreground">{fr.caisseDineIn.items}</p>
            <ul className="mt-2 space-y-1.5 text-sm font-medium text-foreground">
              {lines.map((l, i) => (
                <li key={`${l.name}-${i}`} className="flex justify-between gap-3 tabular-nums">
                  <span className="min-w-0 truncate">
                    {l.qty}× {l.name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              size="lg"
              className="h-12 rounded-xl font-semibold"
              onClick={() => {
                navigate("/tables");
                window.setTimeout(focusInput, 0);
              }}
            >
              {fr.caisseDineIn.openTables}
              <ArrowRight className="ml-2 size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
