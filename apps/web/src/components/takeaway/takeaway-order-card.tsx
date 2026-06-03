import { ChefHat, Clock, MapPin, MessageSquare, Phone, User, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDa } from "@/components/pos/pos-customization-pricing";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import type { TakeawayOrder } from "./takeaway-order-types";
import { formatElapsedShort, minutesUntil } from "./use-takeaway-orders";

function statusLabelFor(s: TakeawayOrder["status"]): string {
  switch (s) {
    case "PENDING":
      return fr.takeawayOrderCard.statusNew;
    case "PREPARING":
      return fr.takeawayOrderCard.statusPreparing;
    case "READY":
      return fr.takeawayOrderCard.statusReady;
    case "COMPLETED":
      return fr.takeawayOrderCard.statusDelivered;
    case "CANCELLED":
      return fr.takeawayOrderCard.statusCancelled;
    default:
      return s;
  }
}

export interface TakeawayOrderCardProps {
  order: TakeawayOrder;
  nowMs: number;
  onStartPreparing?: () => void;
  onMarkReady?: () => void;
  onEncaisser?: () => void;
  onCancel?: () => void;
}

export function TakeawayOrderCard({
  order,
  nowMs,
  onStartPreparing,
  onMarkReady,
  onEncaisser,
  onCancel,
}: TakeawayOrderCardProps) {
  const o = order;
  const createdAtMs = new Date(o.openedAt).getTime();
  const estimatedReadyAtMs = createdAtMs + 20 * 60_000;
  const elapsed = formatElapsedShort(createdAtMs, nowMs);
  const etaMin = minutesUntil(estimatedReadyAtMs, nowMs);
  const isLate = (o.status === "PENDING" || o.status === "PREPARING") && nowMs > estimatedReadyAtMs;

  const prepCountdownLabel =
    o.status === "COMPLETED"
      ? fr.takeawayOrderCard.prepDone
      : o.status === "READY"
        ? etaMin >= 0
          ? fr.takeawayOrderCard.prepPickup(etaMin)
          : fr.takeawayOrderCard.prepWaiting
        : isLate
          ? fr.takeawayOrderCard.prepLate(Math.abs(etaMin))
          : etaMin > 0
            ? fr.takeawayOrderCard.prepEta(etaMin)
            : fr.takeawayOrderCard.prepNow;

  const statusAccent =
    o.status === "CANCELLED"
      ? "border-rose-400/40 shadow-[0_0_20px_rgba(244,63,94,0.12)]"
      : o.status === "PREPARING"
        ? "border-orange-400/45 shadow-[0_0_28px_rgba(251,146,60,0.18)]"
        : o.status === "READY"
          ? "border-emerald-400/45 shadow-[0_0_28px_rgba(52,211,153,0.2)]"
          : o.status === "COMPLETED"
            ? "border-sky-400/35 shadow-[0_0_22px_rgba(56,189,248,0.12)]"
            : "border-violet-400/35 shadow-[0_0_24px_rgba(139,92,246,0.2)]";

  const badgeClass =
    o.status === "CANCELLED"
      ? "bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/45"
      : o.status === "PENDING"
        ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/40"
        : o.status === "PREPARING"
          ? "bg-orange-500/25 text-orange-100 ring-1 ring-orange-400/45"
          : o.status === "READY"
            ? "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/45"
            : "bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/35";

  return (
    <article
      className={cn(
        "surface-dark-ink group/card relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-zinc-900/85 to-zinc-950/95 p-4 backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        "hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(0,0,0,0.45),0_0_36px_rgba(139,92,246,0.2)] motion-reduce:hover:translate-y-0",
        "animate-in fade-in slide-in-from-bottom-2 duration-300",
        statusAccent,
        isLate && "ring-2 ring-amber-400/70 motion-safe:animate-pulse",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold tracking-tight text-on-dark-title">
            {fr.takeawayOrderCard.takeawayNum(String(o.orderNumber || ""))}
            <span className="ml-2 text-xs font-semibold text-on-dark-label">{o.ticketPublicCode ?? ""}</span>
          </h3>
          <p className="mt-1.5 text-xs font-medium text-on-dark-secondary">
            <Clock className="mr-1 inline size-3.5 align-text-bottom text-orange-300/90" aria-hidden />
            {elapsed} {fr.takeawayOrderCard.elapsedSince}
          </p>
        </div>
        <div
          className={cn(
            "max-w-[7.5rem] shrink-0 rounded-lg px-2.5 py-1 text-center text-[11px] font-bold leading-tight tabular-nums",
            isLate && o.status !== "COMPLETED" && o.status !== "READY"
              ? "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/50"
              : o.status === "READY"
                ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/35"
                : "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/30",
          )}
          title={fr.takeawayOrderCard.estPrepAria}
        >
          {prepCountdownLabel}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        <p className="flex items-center gap-2 text-sm font-medium text-on-dark-title">
          <User className="size-4 shrink-0 text-violet-300/90" aria-hidden />
          <span className="truncate font-medium">{o.customer?.name ?? "Client"}</span>
        </p>
        <p className="flex items-center gap-2 text-sm font-medium text-on-dark-secondary">
          <Phone className="size-4 shrink-0 text-fuchsia-300/80" aria-hidden />
          <span className="tabular-nums">{o.customer?.phone || ""}</span>
        </p>
        {o.customer?.address ? (
          <p className="flex items-start gap-2 text-sm font-medium leading-snug text-on-dark-secondary">
            <MapPin className="mt-0.5 size-4 shrink-0 text-orange-300/85" aria-hidden />
            <span className="min-w-0 leading-snug">{o.customer.address}</span>
          </p>
        ) : null}
        {o.customerNotes ? (
          <div className="flex items-start gap-2 rounded-lg border border-sky-400/25 bg-sky-500/10 px-2.5 py-2 text-xs text-sky-100/95">
            <MessageSquare className="mt-0.5 size-4 shrink-0 text-sky-300" aria-hidden />
            <span className="leading-snug">{o.customerNotes}</span>
          </div>
        ) : null}
      </div>

      <ul className="mt-3 space-y-1.5">
        {(o.items || []).map((it) => (
          <li
            key={it.id}
            className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/25 px-2.5 py-2 text-sm"
          >
            <span className="flex h-7 min-w-[2rem] items-center justify-center rounded-md bg-orange-500/20 text-xs font-bold tabular-nums text-orange-100">
              {it.quantity}×
            </span>
            <span className="min-w-0 flex-1 font-semibold leading-snug text-on-dark-title">{it.nameSnapshot || ""}</span>
          </li>
        ))}
      </ul>

      {o.kitchenNotes ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-orange-400/25 bg-orange-500/10 px-2.5 py-2 text-xs text-orange-100/95">
          <ChefHat className="mt-0.5 size-4 shrink-0 text-orange-300" aria-hidden />
          <span className="leading-snug">{o.kitchenNotes}</span>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <div className="text-xs font-medium text-on-dark-secondary">
          <span className="font-medium text-violet-200/90">{fr.takeawayOrderCard.estReadyLine}</span>{" "}
          <span className="tabular-nums font-semibold text-on-dark-title">
            {o.status === "COMPLETED"
              ? fr.takeawayOrderCard.estCompleted
              : etaMin > 0
                ? fr.takeawayOrderCard.footerMin(etaMin)
                : etaMin === 0
                  ? fr.takeawayOrderCard.timerNow
                  : fr.takeawayOrderCard.footerLateMin(Math.abs(etaMin))}
          </span>
        </div>
        <p className="text-lg font-bold tabular-nums text-fuchsia-300 drop-shadow-[0_0_12px_rgba(232,121,249,0.25)]">
          {formatDa(parseFloat(o.total || "0"))}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", badgeClass)}>
          {statusLabelFor(o.status)}
        </span>
      </div>

      {o.status !== "COMPLETED" && o.status !== "CANCELLED" ? (
        <div className="mt-3 flex flex-wrap gap-2 motion-safe:transition-all motion-safe:duration-300">
          {o.status === "PENDING" && onStartPreparing ? (
            <Button
              type="button"
              size="sm"
              className="h-9 min-h-9 flex-1 rounded-lg bg-gradient-to-r from-orange-600 to-amber-500 text-xs font-semibold text-white shadow-[0_6px_20px_rgba(234,88,12,0.35)] hover:from-orange-500 hover:to-amber-400 sm:flex-none"
              onClick={onStartPreparing}
            >
              {fr.takeawayOrderCard.startPreparing}
            </Button>
          ) : null}
          {o.status === "PREPARING" && onMarkReady ? (
            <Button
              type="button"
              size="sm"
              className="h-9 min-h-9 flex-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-xs font-semibold text-white shadow-[0_6px_20px_rgba(16,185,129,0.35)] hover:from-emerald-500 hover:to-teal-400 sm:flex-none"
              onClick={onMarkReady}
            >
              {fr.takeawayOrderCard.markReady}
            </Button>
          ) : null}
          {o.status === "READY" && onEncaisser ? (
            <Button
              type="button"
              size="sm"
              className="h-9 min-h-9 flex-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-500 text-xs font-semibold text-white shadow-[0_6px_20px_rgba(16,185,129,0.35)] hover:from-emerald-500 hover:to-teal-400 sm:flex-none"
              onClick={onEncaisser}
            >
              {fr.takeawayOrderCard.encaisser}
            </Button>
          ) : null}
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-h-9 rounded-lg border-red-400/35 bg-transparent text-xs font-semibold text-red-200/95 hover:bg-red-500/15 hover:text-red-100"
              onClick={onCancel}
            >
              <XCircle className="mr-1 size-3.5" aria-hidden />
              {fr.takeawayOrderCard.cancel}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 rounded-lg bg-gradient-to-r from-violet-950/50 to-fuchsia-950/40 px-3 py-2 text-center text-xs font-semibold text-on-dark-secondary">
        {fr.takeawayOrderCard.statusLine} <span className="text-on-dark-title">{statusLabelFor(o.status)}</span>
      </div>
    </article>
  );
}
