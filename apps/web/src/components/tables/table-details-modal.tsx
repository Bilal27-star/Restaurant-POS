import { ArrowLeft, ChefHat, Clock, CreditCard, UtensilsCrossed, Users, Wallet, Wine, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError } from "@pos/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fr, frGuestsLabel } from "@/lib/locale/fr";
import { getAppApi } from "@/lib/app-api";
import { kitchenDispatchErrorMessage, isKitchenSendIncomplete } from "@/lib/kitchen-response";
import { PrinterService } from "@/lib/printing/printer-service";
import { useTableDetailQuery } from "@/hooks/use-table-detail-query";
import { defaultOrderLinesForDisplay, orderDisplayRef, type OrderLineItem, type RestaurantTable } from "@/components/tables/table-types";

const overlayClass = cn(
  "!bg-black/[0.58] backdrop-blur-xl",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300 ease-out",
);

const panelBaseClass = cn(
  "flex max-h-[min(92vh,44rem)] min-h-0 flex-col overflow-hidden gap-0 rounded-[22px] border border-pos-border-subtle p-0",
  "bg-[linear-gradient(165deg,rgb(15_17_28/0.97)_0%,rgb(9_11_18/0.98)_45%,rgb(8_10_16)_100%)] text-foreground backdrop-blur-2xl",
  "shadow-[0_0_0_1px_rgb(139_92_246/0.12),0_0_80px_-28px_rgb(124_58_237/0.32),0_28px_80px_-36px_rgba(0,0,0,0.72)]",
  "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
);

const QUICK_CASH_NOTES = [1000, 2000, 5000] as const;

function parseMajorAmount(s: unknown): number {
  if (typeof s !== "string") return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseOrderFinances(detailData: unknown, fallbackOrder: RestaurantTable["order"]): {
  balanceDueDa: number;
  totalDa: number;
  subtotalDa: number;
  taxDa: number;
  discountDa: number;
  paidDa: number;
  version?: number;
} {
  const root = detailData && typeof detailData === "object" ? (detailData as Record<string, unknown>) : null;
  const ao = root?.activeOrder;
  if (ao && typeof ao === "object") {
    const r = ao as Record<string, unknown>;
    const total = parseMajorAmount(r.total);
    const paid = parseMajorAmount(r.paidTotal ?? "0");
    const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
    return {
      balanceDueDa: balance,
      totalDa: total,
      subtotalDa: parseMajorAmount(r.subtotal),
      taxDa: parseMajorAmount(r.taxTotal),
      discountDa: parseMajorAmount(r.discountTotal),
      paidDa: paid,
      version: typeof r.version === "number" ? r.version : typeof r.version === "string" ? Number(r.version) : undefined,
    };
  }
  const o = fallbackOrder;
  const total = o
    ? (() => {
        const n = Number.parseFloat(o.totalAmount);
        return Number.isFinite(n) ? n : parseDaFromLabel(o.totalLabel);
      })()
    : 0;
  return {
    balanceDueDa: total,
    totalDa: total,
    subtotalDa: total,
    taxDa: 0,
    discountDa: 0,
    paidDa: 0,
    version: o?.version,
  };
}

function parseDaFromLabel(label: string): number {
  return Number.parseInt(label.replace(/\D/g, ""), 10) || 0;
}

function formatDaDisplay(amount: number): string {
  const n = Math.max(0, Math.round(amount));
  return `${n.toLocaleString("fr-FR")} DA`;
}

function lineIcon(name: string) {
  const n = name.toLowerCase();
  if (/mojito|drink|wine|juice|cola|canette|sprite|eau|café|tea/i.test(n)) return Wine;
  if (/burger|pizza|pâtes|pasta|chef|special|sandwich|taco/i.test(n)) return UtensilsCrossed;
  return UtensilsCrossed;
}

function linesFromDetailPayload(raw: unknown): OrderLineItem[] {
  if (!raw || typeof raw !== "object") return [];
  const root = raw as Record<string, unknown>;
  const ao = root.activeOrder;
  if (!ao || typeof ao !== "object") return [];
  const items = (ao as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: OrderLineItem[] = [];
  for (const row of items) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const qty = typeof r.quantity === "number" ? r.quantity : Number(r.quantity);
    const name = typeof r.nameSnapshot === "string" ? r.nameSnapshot : "";
    if (!Number.isFinite(qty) || qty <= 0 || !name) continue;
    const mods = r.modifiers;
    let detail: string | undefined;
    if (Array.isArray(mods) && mods.length > 0) {
      const labels = mods
        .map((m) => {
          if (!m || typeof m !== "object") return "";
          const o = m as Record<string, unknown>;
          return typeof o.label === "string" ? o.label : "";
        })
        .filter((s) => s.length > 0);
      if (labels.length) detail = labels.join(" · ");
    }
    out.push({ qty, name, ...(detail ? { detail } : {}) });
  }
  return out;
}

export type TablePaymentMethod = "cash" | "card";

export interface TableDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: RestaurantTable | null;
  onAddItems: () => void;
  /** After successful `POST /payments/checkout` (invalidate queries, toast). */
  onCheckoutSuccess?: (info: {
    paymentId: string;
    orderId: string;
    method: TablePaymentMethod;
    changeMajorDa: number;
  }) => void | Promise<void>;
  /** Optional: e.g. toast when receipt print/popup fails after a successful payment. */
  onReceiptPrintWarning?: () => void;
  onKitchenResendSuccess?: () => void;
}

export function TableDetailsModal({
  open,
  onOpenChange,
  table,
  onAddItems,
  onCheckoutSuccess,
  onReceiptPrintWarning,
  onKitchenResendSuccess,
}: TableDetailsModalProps) {
  const [step, setStep] = useState<"details" | "pay" | "cash">("details");
  const [method, setMethod] = useState<TablePaymentMethod>("cash");
  const [receivedStr, setReceivedStr] = useState("");
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [kitchenResendSubmitting, setKitchenResendSubmitting] = useState(false);
  const [kitchenConfirmOpen, setKitchenConfirmOpen] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const checkoutLockRef = useRef(false);
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("details");
      setMethod("cash");
      setReceivedStr("");
      setCheckoutSubmitting(false);
      setPayError(null);
      setKitchenConfirmOpen(false);
      setKitchenResendSubmitting(false);
      checkoutLockRef.current = false;
      checkoutIdempotencyKeyRef.current = null;
    }
  }, [open, table?.id]);

  const order = table?.order;
  const tableTitle = table ? `${fr.common.table} ${table.numberLabel}` : fr.common.table;

  const detail = useTableDetailQuery(table?.id ?? null, open && Boolean(table?.id));

  const waiterFromDetail = useMemo(() => {
    const raw = detail.data;
    if (!raw || typeof raw !== "object") return undefined;
    const ao = (raw as { activeOrder?: unknown }).activeOrder;
    if (!ao || typeof ao !== "object") return undefined;
    const w = (ao as { waiterName?: unknown }).waiterName;
    return typeof w === "string" && w.trim() ? w.trim() : undefined;
  }, [detail.data]);

  const lines = useMemo(() => {
    const fromApi = linesFromDetailPayload(detail.data);
    if (fromApi.length) return fromApi;
    if (order) return defaultOrderLinesForDisplay(order);
    return [];
  }, [detail.data, order]);

  const waiter =
    table && order ? waiterFromDetail ?? (order.waiterName?.trim() || "—") : "—";
  const guestsLabel = order ? frGuestsLabel(order.guests) : "—";
  const duration = order?.elapsedLabel ?? "—";

  const finances = useMemo(() => parseOrderFinances(detail.data, order), [detail.data, order]);
  const billDa = finances.balanceDueDa;
  const displayTotalLabel = `${Math.round(finances.totalDa).toLocaleString("fr-DZ")} DA`;
  const balanceDueLabel = `${Math.round(billDa).toLocaleString("fr-DZ")} DA`;

  const receivedNum = useMemo(() => {
    const digits = receivedStr.replace(/\D/g, "");
    if (!digits) return 0;
    return Number.parseInt(digits, 10) || 0;
  }, [receivedStr]);

  const changeAmount = receivedNum > billDa ? Math.round((receivedNum - billDa) * 100) / 100 : 0;
  const remainingOwed = billDa > receivedNum ? Math.round((billDa - receivedNum) * 100) / 100 : 0;
  const hasReceivedInput = receivedStr.replace(/\D/g, "").length > 0;
  const canConfirmCash = billDa > 0.004 && receivedNum + 1e-6 >= billDa;
  const showInsufficient = hasReceivedInput && receivedNum > 0 && receivedNum + 1e-6 < billDa;
  const showExact = hasReceivedInput && Math.abs(receivedNum - billDa) < 0.015;
  const showChange = hasReceivedInput && receivedNum > billDa + 1e-6;

  const resetAndClose = (next: boolean) => {
    if (!next) {
      setStep("details");
      setMethod("cash");
      setReceivedStr("");
      setPayError(null);
    }
    onOpenChange(next);
  };

  const runCheckout = async (payMethod: TablePaymentMethod) => {
    if (!order || checkoutSubmitting || checkoutLockRef.current) return;
    if (billDa <= 0.004) {
      setPayError("Rien à encaisser sur cette commande.");
      return;
    }
    checkoutLockRef.current = true;
    setPayError(null);
    setCheckoutSubmitting(true);
    try {
      const version = finances.version ?? order.version;
      const body: {
        orderId: string;
        method: "CASH" | "CARD";
        cashReceived?: string | null;
        orderVersion?: number;
        idempotencyKey?: string | null;
      } = {
        orderId: order.id,
        method: payMethod === "cash" ? "CASH" : "CARD",
      };
      if (!checkoutIdempotencyKeyRef.current) {
        checkoutIdempotencyKeyRef.current =
          typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `chk-${Date.now()}`;
      }
      body.idempotencyKey = checkoutIdempotencyKeyRef.current;
      if (payMethod === "cash") {
        const digits = receivedStr.replace(/\D/g, "");
        const n = Number.parseInt(digits, 10) || 0;
        body.cashReceived = n.toFixed(2);
      }
      if (version != null && Number.isFinite(version)) {
        body.orderVersion = version;
      }
      const data = await getAppApi().payments.checkout(body);
      const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      const pay = root?.payment;
      const paymentId =
        pay && typeof pay === "object" && typeof (pay as { id?: unknown }).id === "string"
          ? (pay as { id: string }).id
          : "";
      const cgRaw =
        pay && typeof pay === "object" ? (pay as { changeGiven?: string | null }).changeGiven : null;
      const changeMajorDa = typeof cgRaw === "string" ? Number.parseFloat(cgRaw) : 0;
      let receiptOk = true;
      if (paymentId) {
        receiptOk = await PrinterService.printCashierReceiptFromPaymentId(paymentId);
      }
      await onCheckoutSuccess?.({
        paymentId,
        orderId: order.id,
        method: payMethod,
        changeMajorDa: Number.isFinite(changeMajorDa) ? changeMajorDa : 0,
      });
      if (!receiptOk) {
        onReceiptPrintWarning?.();
      }
      resetAndClose(false);
    } catch (e) {
      const msg =
        e instanceof ApiClientError && typeof e.details === "object" && e.details !== null && "message" in e.details
          ? String((e.details as Record<string, unknown>).message)
          : e instanceof Error
            ? e.message
            : "Paiement impossible.";
      setPayError(msg || "Paiement impossible.");
    } finally {
      checkoutLockRef.current = false;
      setCheckoutSubmitting(false);
    }
  };

  const runKitchenResend = async () => {
    if (!order || kitchenResendSubmitting) return;
    setKitchenResendSubmitting(true);
    setPayError(null);
    try {
      const clientMutationId =
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `kr-${Date.now()}`;
      const data = await getAppApi().orders.fullKitchenReprint(order.id, { clientMutationId });
      if (isKitchenSendIncomplete(data)) {
        setPayError(kitchenDispatchErrorMessage(null, data));
        return;
      }
      setKitchenConfirmOpen(false);
      onKitchenResendSuccess?.();
      void detail.refetch();
    } catch (e) {
      setPayError(kitchenDispatchErrorMessage(e));
    } finally {
      setKitchenResendSubmitting(false);
    }
  };

  const appendQuickNote = (amount: number) => {
    setReceivedStr((prev) => {
      const cur = Number.parseInt(prev.replace(/\D/g, ""), 10) || 0;
      return String(cur + amount);
    });
  };

  const onReceivedChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    setReceivedStr(digits);
  };

  const panelClass = cn(
    panelBaseClass,
    step === "cash" ? "w-[min(100vw-1.25rem,28rem)]" : "w-[min(100vw-1.25rem,26rem)]",
  );

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent hideClose overlayClassName={overlayClass} className={panelClass}>
        <DialogTitle className="sr-only">{fr.tableDetails.srTitle(tableTitle)}</DialogTitle>
        <DialogDescription className="sr-only">{fr.tableDetails.srDesc}</DialogDescription>

        {table && order ? (
          <>
            {payError ? (
              <div className="border-b border-red-500/25 bg-red-950/40 px-5 py-2.5 text-center text-xs font-semibold text-red-100 md:px-6">
                {payError}
              </div>
            ) : null}
            {step === "details" ? (
              <header className="relative shrink-0 border-b border-pos-border-subtle/90 px-5 pb-4 pt-5 md:px-6">
                <div className="flex flex-wrap items-center gap-2 pr-12">
                  <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{tableTitle}</h2>
                  <span className="rounded-full border border-amber-500/35 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-100 shadow-[0_0_16px_-4px_rgba(245,158,11,0.35)]">
                    {fr.tableDetails.occupied}
                  </span>
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground md:text-[13px]">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5 shrink-0 opacity-80" aria-hidden />
                    {waiter}
                  </span>
                  <span className="text-border" aria-hidden>
                    ·
                  </span>
                  <span>{guestsLabel}</span>
                  <span className="text-border" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5 shrink-0 opacity-80" aria-hidden />
                    {duration}
                  </span>
                </p>
                <button
                  type="button"
                  className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-xl border border-pos-border-subtle bg-pos-glass text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  onClick={() => resetAndClose(false)}
                  aria-label={fr.common.close}
                >
                  <X className="size-5" />
                </button>
              </header>
            ) : step === "pay" ? (
              <header className="relative shrink-0 border-b border-pos-border-subtle/90 px-5 pb-4 pt-5 md:px-6">
                <button
                  type="button"
                  className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-transparent px-1 py-1 text-sm font-semibold text-muted-foreground transition hover:border-pos-border-subtle hover:bg-pos-glass hover:text-foreground"
                  onClick={() => setStep("details")}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  {fr.tableDetails.backToOrder}
                </button>
                <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{fr.tableDetails.payment}</h2>
                <p className="mt-1 text-sm font-medium text-muted-foreground">{fr.tableDetails.paymentHint}</p>
                <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground/90">
                  {tableTitle} · <span className="font-mono text-violet-200/90">{orderDisplayRef(order)}</span> ·{" "}
                  <span className="font-semibold text-orange-200/95">{displayTotalLabel}</span>
                  {finances.paidDa > 0.004 ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {fr.tableDetails.balanceDue}{" "}
                      <span className="font-semibold text-amber-200/95">{balanceDueLabel}</span>
                    </span>
                  ) : null}
                </p>
                <button
                  type="button"
                  className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-xl border border-pos-border-subtle bg-pos-glass text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  onClick={() => resetAndClose(false)}
                  aria-label={fr.common.close}
                >
                  <X className="size-5" />
                </button>
              </header>
            ) : (
              <header className="relative shrink-0 border-b border-pos-border-subtle/90 px-5 pb-4 pt-5 md:px-6">
                <button
                  type="button"
                  className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-transparent px-1 py-1 text-sm font-semibold text-muted-foreground transition hover:border-pos-border-subtle hover:bg-pos-glass hover:text-foreground"
                  onClick={() => {
                    setReceivedStr("");
                    setStep("pay");
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  {fr.tableDetails.paymentMethod}
                </button>
                <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{fr.tableDetails.cashPayment}</h2>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-muted-foreground">
                  {fr.tableDetails.cashHint}
                </p>
                <button
                  type="button"
                  className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-xl border border-pos-border-subtle bg-pos-glass text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  onClick={() => resetAndClose(false)}
                  aria-label={fr.common.close}
                >
                  <X className="size-5" />
                </button>
              </header>
            )}

            {step === "details" ? (
              <div className="scrollbar-pos-modal min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
                <section className="mb-6">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{fr.tableDetails.orderDetails}</h3>
                  <div
                    className={cn(
                      "mt-3 rounded-[14px] border border-pos-border-subtle/80 bg-pos-depth/50 p-4 ring-1 ring-violet-500/[0.06]",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-muted-foreground">{fr.tableDetails.orderId}</span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-violet-200">{orderDisplayRef(order)}</span>
                    </div>
                    <div className="mt-4 border-t border-pos-border-subtle/60 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fr.tableDetails.totalAmount}</p>
                      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-orange-300 md:text-[2rem]">
                        {displayTotalLabel}
                      </p>
                      {finances.taxDa > 0.004 || finances.discountDa > 0.004 ? (
                        <div className="mt-3 space-y-1 text-xs font-medium text-muted-foreground">
                          <div className="flex justify-between gap-2">
                            <span>{fr.tableDetails.subtotal}</span>
                            <span className="tabular-nums text-foreground/90">
                              {Math.round(finances.subtotalDa).toLocaleString("fr-DZ")} DA
                            </span>
                          </div>
                          {finances.taxDa > 0.004 ? (
                            <div className="flex justify-between gap-2">
                              <span>{fr.tableDetails.tax}</span>
                              <span className="tabular-nums text-foreground/90">
                                {Math.round(finances.taxDa).toLocaleString("fr-DZ")} DA
                              </span>
                            </div>
                          ) : null}
                          {finances.discountDa > 0.004 ? (
                            <div className="flex justify-between gap-2">
                              <span>{fr.tableDetails.discount}</span>
                              <span className="tabular-nums text-foreground/90">
                                −{Math.round(finances.discountDa).toLocaleString("fr-DZ")} DA
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {finances.paidDa > 0.004 ? (
                        <p className="mt-3 text-sm font-semibold text-amber-200/95">
                          {fr.tableDetails.balanceDue}: {balanceDueLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{fr.tableDetails.orderItems}</h3>
                  {detail.isFetching && lines.length === 0 ? (
                    <p className="mt-3 text-sm font-medium text-muted-foreground">{fr.tableDetails.loadingItems}</p>
                  ) : null}
                  <ul className="mt-3 space-y-2">
                    {lines.map((line, idx) => {
                      const Icon = lineIcon(line.name);
                      return (
                        <li
                          key={`${line.name}-${idx}`}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border border-pos-border-subtle/60 bg-pos-glass/30 px-3 py-2.5",
                            "transition-[box-shadow,border-color,transform] duration-200 hover:border-zinc-500/40 hover:shadow-[0_0_20px_-8px_rgba(129,140,248,0.2)]",
                          )}
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-pos-depth/80 ring-1 ring-white/[0.06]">
                            <Icon className="size-4 text-muted-foreground" aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">
                              <span className="tabular-nums text-orange-200/90">{line.qty}×</span> {line.name}
                            </p>
                            {line.detail ? (
                              <p className="mt-0.5 text-xs font-medium leading-snug text-muted-foreground">{line.detail}</p>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              </div>
            ) : null}

            {step === "pay" ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-6">
                <div className="mb-5 rounded-[14px] border border-pos-border-subtle/70 bg-pos-depth/45 p-4 text-sm">
                  <div className="flex justify-between gap-2 text-muted-foreground">
                    <span>{fr.tableDetails.subtotal}</span>
                    <span className="tabular-nums font-semibold text-foreground">
                      {Math.round(finances.subtotalDa).toLocaleString("fr-DZ")} DA
                    </span>
                  </div>
                  {finances.taxDa > 0.004 ? (
                    <div className="mt-2 flex justify-between gap-2 text-muted-foreground">
                      <span>{fr.tableDetails.tax}</span>
                      <span className="tabular-nums font-semibold text-foreground">
                        {Math.round(finances.taxDa).toLocaleString("fr-DZ")} DA
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-2 flex justify-between gap-2 border-t border-pos-border-subtle/50 pt-2 font-semibold text-foreground">
                    <span>{fr.tableDetails.totalAmount}</span>
                    <span className="tabular-nums text-orange-200/95">{displayTotalLabel}</span>
                  </div>
                  {finances.paidDa > 0.004 ? (
                    <div className="mt-2 flex justify-between gap-2 text-amber-200/95">
                      <span>{fr.tableDetails.balanceDue}</span>
                      <span className="tabular-nums font-bold">{balanceDueLabel}</span>
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={checkoutSubmitting}
                    onClick={() => setMethod("cash")}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-semibold transition-all duration-200",
                      method === "cash"
                        ? "border-emerald-400/45 bg-emerald-500/15 text-emerald-50 shadow-[0_0_24px_-8px_rgba(16,185,129,0.35)]"
                        : "border-pos-border-subtle bg-pos-depth/40 text-muted-foreground hover:border-zinc-500/50 hover:text-foreground",
                    )}
                  >
                    <Wallet className="size-6" aria-hidden />
                    {fr.common.cash}
                  </button>
                  <button
                    type="button"
                    disabled={checkoutSubmitting}
                    onClick={() => setMethod("card")}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-semibold transition-all duration-200",
                      method === "card"
                        ? "border-emerald-400/45 bg-emerald-500/15 text-emerald-50 shadow-[0_0_24px_-8px_rgba(16,185,129,0.35)]"
                        : "border-pos-border-subtle bg-pos-depth/40 text-muted-foreground hover:border-zinc-500/50 hover:text-foreground",
                    )}
                  >
                    <CreditCard className="size-6" aria-hidden />
                    {fr.common.card}
                  </button>
                </div>
              </div>
            ) : null}

            {step === "cash" ? (
              <div className="scrollbar-pos-modal min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
                <div
                  className={cn(
                    "rounded-[16px] border border-pos-border-subtle/80 bg-pos-depth/55 p-4 ring-1 ring-violet-500/[0.07]",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                  )}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{fr.tableDetails.orderSummary}</p>
                  <div className="mt-3 flex flex-col gap-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-muted-foreground">{fr.tableDetails.table}</span>
                      <span className="font-semibold text-foreground">{tableTitle}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-muted-foreground">{fr.tableDetails.orderId}</span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-violet-200">{orderDisplayRef(order)}</span>
                    </div>
                    <div className="mt-2 border-t border-pos-border-subtle/60 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fr.tableDetails.totalBill}</p>
                      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-orange-300 md:text-[2.125rem]">
                        {displayTotalLabel}
                      </p>
                      {finances.paidDa > 0.004 ? (
                        <p className="mt-2 text-sm font-semibold text-amber-200/95">
                          {fr.tableDetails.balanceDue}: {balanceDueLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <label htmlFor="cash-received" className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {fr.tableDetails.amountReceived}
                  </label>
                  <div className="relative mt-2">
                    <input
                      id="cash-received"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      disabled={checkoutSubmitting}
                      value={receivedStr}
                      onChange={(e) => onReceivedChange(e.target.value)}
                      className={cn(
                        "w-full rounded-[14px] border border-pos-border-subtle bg-pos-depth/70 py-4 pl-4 pr-16 text-3xl font-bold tabular-nums tracking-tight text-foreground shadow-inner",
                        "ring-1 ring-white/[0.04] transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/35",
                        "focus-visible:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25",
                      )}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                      DA
                    </span>
                  </div>
                  {!hasReceivedInput ? (
                    <p className="mt-2 text-xs font-medium text-muted-foreground">{fr.tableDetails.cashHintInput}</p>
                  ) : null}
                </div>

                <div className="mt-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{fr.tableDetails.quickCash}</p>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {QUICK_CASH_NOTES.map((note) => (
                      <button
                        key={note}
                        type="button"
                        disabled={checkoutSubmitting}
                        onClick={() => appendQuickNote(note)}
                        className={cn(
                          "rounded-xl border border-pos-border-subtle bg-pos-glass/40 py-2.5 text-[11px] font-bold tabular-nums leading-tight text-foreground",
                          "transition-all duration-200 hover:border-violet-500/35 hover:bg-pos-depth/80 hover:shadow-[0_0_18px_-6px_rgba(139,92,246,0.25)] active:scale-[0.98]",
                        )}
                      >
                        {note.toLocaleString("fr-FR")} DA
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={checkoutSubmitting}
                      onClick={() => setReceivedStr(String(Math.round(billDa)))}
                      className={cn(
                        "rounded-xl border border-emerald-500/35 bg-emerald-500/10 py-2.5 text-[11px] font-bold leading-tight text-emerald-100",
                        "transition-all duration-200 hover:border-emerald-400/50 hover:bg-emerald-500/15 active:scale-[0.98]",
                      )}
                    >
                      {fr.tableDetails.quickExact}
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] font-medium text-muted-foreground/80">{fr.tableDetails.quickCashHint}</p>
                </div>

                <div className="mt-6 min-h-[7.5rem]">
                  {showInsufficient ? (
                    <div
                      className={cn(
                        "rounded-[14px] border border-red-500/35 bg-red-500/[0.09] px-4 py-4 text-center",
                        "animate-in fade-in zoom-in-95 duration-200",
                      )}
                    >
                      <p className="text-sm font-semibold text-red-200">
                        {fr.tableDetails.owes(formatDaDisplay(remainingOwed))}
                      </p>
                    </div>
                  ) : null}

                  {showExact ? (
                    <div
                      className={cn(
                        "rounded-[14px] border border-emerald-500/30 bg-emerald-500/[0.08] px-4 py-5 text-center",
                        "animate-in fade-in zoom-in-95 duration-200",
                      )}
                    >
                      <p className="text-lg font-bold text-emerald-100">{fr.tableDetails.exactPayment}</p>
                      <p className="mt-1 text-xs font-medium text-emerald-200/75">{fr.tableDetails.noChange}</p>
                    </div>
                  ) : null}

                  {showChange ? (
                    <div
                      key={changeAmount}
                      className={cn(
                        "rounded-[16px] border border-emerald-400/40 bg-gradient-to-br from-emerald-500/[0.14] to-emerald-600/[0.06] px-4 py-5 text-center",
                        "shadow-[0_0_40px_-12px_rgba(52,211,153,0.35)] ring-1 ring-emerald-400/15",
                        "animate-in fade-in zoom-in-95 duration-200",
                      )}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/90">{fr.tableDetails.changeToReturn}</p>
                      <p className="mt-2 text-4xl font-extrabold tabular-nums tracking-tight text-emerald-50 md:text-[2.75rem]">
                        {formatDaDisplay(changeAmount)}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <footer className="shrink-0 border-t border-pos-border-subtle/90 bg-gradient-to-t from-[rgb(7_8_12/0.98)] via-pos-depth/95 to-pos-depth/85 px-5 py-4 backdrop-blur-md md:px-6">
              {step === "details" ? (
                <div className="flex flex-col gap-3">
                  {kitchenConfirmOpen ? (
                    <div className="rounded-[14px] border border-orange-500/30 bg-orange-500/10 px-4 py-3">
                      <p className="text-center text-sm font-semibold text-orange-100">{fr.tableDetails.resendKitchenConfirm}</p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 min-h-10 flex-1 rounded-[12px] border-pos-border-subtle bg-pos-glass font-semibold"
                          disabled={kitchenResendSubmitting}
                          onClick={() => setKitchenConfirmOpen(false)}
                        >
                          {fr.common.cancel}
                        </Button>
                        <Button
                          type="button"
                          className="h-10 min-h-10 flex-1 rounded-[12px] border-0 bg-gradient-to-r from-orange-600 to-amber-500 text-sm font-bold text-white"
                          disabled={kitchenResendSubmitting || lines.length === 0}
                          onClick={() => void runKitchenResend()}
                        >
                          {kitchenResendSubmitting ? fr.tableDetails.resendKitchenLoading : fr.tableDetails.resendKitchenConfirmYes}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 min-h-12 flex-1 rounded-[14px] border-pos-border-subtle bg-pos-glass/90 text-sm font-bold text-foreground shadow-sm transition hover:bg-secondary"
                      disabled={checkoutSubmitting || kitchenResendSubmitting}
                      onClick={() => {
                        onAddItems();
                      }}
                    >
                      <span className="mr-1.5 text-base font-extrabold">+</span>
                      {fr.tableDetails.addItems}
                    </Button>
                    <Button
                      type="button"
                      className="h-12 min-h-12 flex-1 rounded-[14px] border-0 bg-gradient-to-r from-emerald-700/95 to-emerald-600/95 text-sm font-bold text-white shadow-[0_8px_28px_-10px_rgba(16,185,129,0.4)] transition hover:from-emerald-600 hover:to-emerald-500 hover:shadow-[0_12px_32px_-10px_rgba(52,211,153,0.35)] disabled:pointer-events-none disabled:opacity-40"
                      disabled={billDa <= 0.004 || kitchenResendSubmitting}
                      onClick={() => {
                        checkoutIdempotencyKeyRef.current =
                          typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `chk-${Date.now()}`;
                        setStep("pay");
                      }}
                    >
                      {fr.tableDetails.closeAndPay}
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 min-h-11 w-full rounded-[14px] border-orange-500/35 bg-orange-500/10 text-sm font-bold text-orange-100 hover:bg-orange-500/15"
                    disabled={checkoutSubmitting || kitchenResendSubmitting || lines.length === 0}
                    onClick={() => {
                      setPayError(null);
                      setKitchenConfirmOpen(true);
                    }}
                  >
                    <ChefHat className="mr-2 size-4 shrink-0" aria-hidden />
                    {fr.tableDetails.resendKitchen}
                  </Button>
                </div>
              ) : null}

              {step === "pay" ? (
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 min-h-12 flex-1 rounded-[14px] border-pos-border-subtle bg-pos-glass font-semibold"
                    disabled={checkoutSubmitting}
                    onClick={() => setStep("details")}
                  >
                    {fr.common.back}
                  </Button>
                  {method === "card" ? (
                    <Button
                      type="button"
                      disabled={checkoutSubmitting || billDa <= 0.004}
                      className="h-12 min-h-12 flex-1 rounded-[14px] border-0 bg-gradient-to-r from-emerald-700/95 to-emerald-600/95 text-sm font-bold text-white shadow-[0_8px_28px_-10px_rgba(16,185,129,0.4)] transition hover:from-emerald-600 hover:to-emerald-500 disabled:pointer-events-none disabled:opacity-40"
                      onClick={() => void runCheckout("card")}
                    >
                      {checkoutSubmitting ? fr.tableDetails.confirmPaymentLoading : fr.tableDetails.confirmPayment}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={checkoutSubmitting}
                      className="h-12 min-h-12 flex-1 rounded-[14px] border-0 bg-gradient-to-r from-emerald-700/95 to-emerald-600/95 text-sm font-bold text-white shadow-[0_8px_28px_-10px_rgba(16,185,129,0.4)] transition hover:from-emerald-600 hover:to-emerald-500 disabled:pointer-events-none disabled:opacity-40"
                      onClick={() => {
                        setReceivedStr("");
                        setStep("cash");
                      }}
                    >
                      {fr.common.continue}
                    </Button>
                  )}
                </div>
              ) : null}

              {step === "cash" ? (
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 min-h-12 flex-1 rounded-[14px] border-pos-border-subtle bg-pos-glass font-semibold"
                    disabled={checkoutSubmitting}
                    onClick={() => {
                      setReceivedStr("");
                      setStep("pay");
                    }}
                  >
                    {fr.common.cancel}
                  </Button>
                  <Button
                    type="button"
                    disabled={!canConfirmCash || checkoutSubmitting}
                    className="h-12 min-h-12 flex-1 rounded-[14px] border-0 bg-gradient-to-r from-emerald-700/95 to-emerald-600/95 text-sm font-bold text-white shadow-[0_8px_28px_-10px_rgba(16,185,129,0.4)] transition hover:from-emerald-600 hover:to-emerald-500 disabled:pointer-events-none disabled:opacity-40"
                    onClick={() => void runCheckout("cash")}
                  >
                    {checkoutSubmitting ? fr.tableDetails.confirmPaymentLoading : fr.tableDetails.confirmPayment}
                  </Button>
                </div>
              ) : null}
            </footer>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
