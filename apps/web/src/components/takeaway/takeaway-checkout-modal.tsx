import { useMemo, useRef, useState } from "react";
import { ApiClientError } from "@pos/api-client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDa } from "@/components/pos/pos-customization-pricing";
import { getAppApi } from "@/lib/app-api";
import { fr } from "@/lib/locale/fr";
import { PrinterService } from "@/lib/printing/printer-service";
import { cn } from "@/lib/utils";
import type { SerializedTakeawayOrder } from "@/types/serialized-order";

const QUICK_CASH_NOTES = [1000, 2000, 5000] as const;

function formatDaDisplay(amount: number): string {
  return `${Math.round(amount).toLocaleString("fr-DZ")} DA`;
}

export interface TakeawayCheckoutModalProps {
  order: SerializedTakeawayOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  onPrintWarning?: () => void;
}

export function TakeawayCheckoutModal({
  order,
  open,
  onOpenChange,
  onSuccess,
  onPrintWarning,
}: TakeawayCheckoutModalProps) {
  const [receivedStr, setReceivedStr] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const checkoutLockRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const billDa = useMemo(() => {
    if (!order) return 0;
    const n = Number.parseFloat(order.total);
    return Number.isFinite(n) ? n : 0;
  }, [order]);

  const receivedNum = useMemo(() => {
    const digits = receivedStr.replace(/\D/g, "");
    if (!digits) return 0;
    return Number.parseInt(digits, 10) || 0;
  }, [receivedStr]);

  const changeAmount = receivedNum > billDa ? Math.round((receivedNum - billDa) * 100) / 100 : 0;
  const remainingOwed = billDa > receivedNum ? Math.round((billDa - receivedNum) * 100) / 100 : 0;
  const hasReceivedInput = receivedStr.replace(/\D/g, "").length > 0;
  const canConfirm = billDa > 0.004 && receivedNum + 1e-6 >= billDa;
  const showInsufficient = hasReceivedInput && receivedNum > 0 && receivedNum + 1e-6 < billDa;
  const showExact = hasReceivedInput && Math.abs(receivedNum - billDa) < 0.015;
  const showChange = hasReceivedInput && receivedNum > billDa + 1e-6;

  const resetState = () => {
    setReceivedStr("");
    setPayError(null);
    idempotencyKeyRef.current = null;
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetState();
    onOpenChange(next);
  };

  const appendQuickNote = (amount: number) => {
    setReceivedStr((prev) => {
      const cur = Number.parseInt(prev.replace(/\D/g, ""), 10) || 0;
      return String(cur + amount);
    });
  };

  const onReceivedChange = (raw: string) => {
    setReceivedStr(raw.replace(/\D/g, ""));
  };

  const runCheckout = async () => {
    if (!order || submitting || checkoutLockRef.current) return;
    if (billDa <= 0.004) {
      setPayError("Rien à encaisser sur cette commande.");
      return;
    }
    if (!canConfirm) return;

    checkoutLockRef.current = true;
    setPayError(null);
    setSubmitting(true);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current =
          typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tko-${Date.now()}`;
      }
      const body: {
        orderId: string;
        method: "CASH";
        cashReceived: string;
        orderVersion?: number;
        idempotencyKey: string;
      } = {
        orderId: order.id,
        method: "CASH",
        cashReceived: receivedNum.toFixed(2),
        idempotencyKey: idempotencyKeyRef.current,
      };
      if (order.version != null && Number.isFinite(order.version)) {
        body.orderVersion = order.version;
      }

      const data = await getAppApi().payments.checkout(body);
      const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      const pay = root?.payment;
      const paymentId =
        pay && typeof pay === "object" && typeof (pay as { id?: unknown }).id === "string"
          ? (pay as { id: string }).id
          : "";

      let receiptOk = true;
      if (paymentId) {
        receiptOk = await PrinterService.afterSuccessfulCheckout(paymentId);
      }

      onSuccess?.();
      if (!receiptOk) {
        onPrintWarning?.();
      }
      handleOpenChange(false);
    } catch (e) {
      const msg =
        e instanceof ApiClientError && typeof e.details === "object" && e.details !== null && "message" in e.details
          ? String((e.details as Record<string, unknown>).message)
          : e instanceof Error
            ? e.message
            : fr.takeawayCheckout.paymentError;
      setPayError(msg || fr.takeawayCheckout.paymentError);
    } finally {
      checkoutLockRef.current = false;
      setSubmitting(false);
    }
  };

  const customerName = order?.customer?.name || "Client";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="surface-dark-ink max-h-[min(92vh,40rem)] w-[min(100vw-1.25rem,28rem)] overflow-hidden border-white/[0.08] bg-zinc-950/95 p-0 backdrop-blur-xl">
        <DialogHeader className="shrink-0 border-b border-white/[0.08] px-5 py-4">
          <DialogTitle>{fr.takeawayCheckout.title}</DialogTitle>
          <DialogDescription>
            {order
              ? fr.takeawayCheckout.desc(String(order.orderNumber || ""), customerName)
              : fr.takeawayPage.noSelection}
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-pos-modal min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="rounded-xl border border-white/[0.08] bg-zinc-900/50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {fr.takeawayCheckout.total}
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-orange-300">{formatDa(billDa)}</p>
          </div>

          <div className="mt-5">
            <label htmlFor="takeaway-cash-received" className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {fr.takeawayCheckout.amountReceived}
            </label>
            <div className="relative mt-2">
              <input
                id="takeaway-cash-received"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                disabled={submitting}
                value={receivedStr}
                onChange={(e) => onReceivedChange(e.target.value)}
                className={cn(
                  "w-full rounded-xl border border-white/[0.08] bg-zinc-900/70 py-4 pl-4 pr-16 text-3xl font-bold tabular-nums tracking-tight text-foreground shadow-inner",
                  "focus-visible:border-violet-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25",
                )}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                DA
              </span>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {fr.takeawayCheckout.quickCash}
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {QUICK_CASH_NOTES.map((note) => (
                <button
                  key={note}
                  type="button"
                  disabled={submitting}
                  onClick={() => appendQuickNote(note)}
                  className="rounded-xl border border-white/[0.08] bg-zinc-900/40 py-2.5 text-[11px] font-bold tabular-nums text-foreground transition hover:border-violet-500/35 hover:bg-zinc-800/80"
                >
                  {note.toLocaleString("fr-FR")} DA
                </button>
              ))}
              <button
                type="button"
                disabled={submitting}
                onClick={() => setReceivedStr(String(Math.round(billDa)))}
                className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 py-2.5 text-[11px] font-bold text-emerald-100 transition hover:border-emerald-400/50"
              >
                {fr.takeawayCheckout.quickExact}
              </button>
            </div>
          </div>

          <div className="mt-5 min-h-[6rem]">
            {showInsufficient ? (
              <div className="rounded-xl border border-red-500/35 bg-red-500/[0.09] px-4 py-4 text-center">
                <p className="text-sm font-semibold text-red-200">{fr.takeawayCheckout.owes(formatDaDisplay(remainingOwed))}</p>
              </div>
            ) : null}
            {showExact ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-4 py-4 text-center">
                <p className="text-lg font-bold text-emerald-100">{fr.takeawayCheckout.exactPayment}</p>
                <p className="mt-1 text-xs font-medium text-emerald-200/75">{fr.takeawayCheckout.noChange}</p>
              </div>
            ) : null}
            {showChange ? (
              <div className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/[0.14] to-emerald-600/[0.06] px-4 py-4 text-center">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200/90">
                  {fr.takeawayCheckout.changeToReturn}
                </p>
                <p className="mt-2 text-4xl font-extrabold tabular-nums tracking-tight text-emerald-50">
                  {formatDaDisplay(changeAmount)}
                </p>
              </div>
            ) : null}
          </div>

          {payError ? (
            <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-950/30 px-3 py-2 text-sm font-medium text-rose-100" role="alert">
              {payError}
            </p>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-white/[0.08] px-5 py-4 sm:justify-between">
          <Button type="button" variant="outline" className="min-h-11" disabled={submitting} onClick={() => handleOpenChange(false)}>
            {fr.takeawayCheckout.cancel}
          </Button>
          <Button
            type="button"
            className="min-h-11 bg-gradient-to-r from-emerald-600 to-teal-500 font-semibold text-white hover:from-emerald-500 hover:to-teal-400"
            disabled={!order || submitting || !canConfirm}
            onClick={() => void runCheckout()}
          >
            {submitting ? fr.takeawayCheckout.confirmLoading : fr.takeawayCheckout.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
