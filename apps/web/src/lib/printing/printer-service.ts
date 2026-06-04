import { getAppApi } from "@/lib/app-api";
import { isTauriDesktop } from "@/lib/desktop/tauri-host";
import {
  type PaymentReceiptPrintDocument,
  openPaymentReceiptPrintWindow,
} from "@/lib/tickets/payment-receipt-print";

/**
 * Abstraction for future thermal/USB printers. Today: fetch receipt payloads and open a print window.
 * Kitchen tickets can reuse `GET /orders/:id/print/kitchen` when wired.
 */
export class PrinterService {
  /** Loads the canonical payment receipt document from the API and opens a print-friendly window. */
  static async printCashierReceiptFromPaymentId(paymentId: string): Promise<boolean> {
    if (isTauriDesktop()) {
      try {
        await getAppApi().payments.reprintReceipt(paymentId);
        return true;
      } catch {
        return false;
      }
    }
    try {
      const raw = await getAppApi().payments.receipt(paymentId);
      if (!raw || typeof raw !== "object") return false;
      const o = raw as Record<string, unknown>;
      if (o.kind !== "payment_receipt") return false;
      return openPaymentReceiptPrintWindow(raw as PaymentReceiptPrintDocument);
    } catch {
      return false;
    }
  }

  /** Placeholder job descriptor for a kitchen reprint (hardware layer TBD). */
  static buildKitchenTicketJob(orderId: string): { kind: "kitchen_ticket"; orderId: string } {
    return { kind: "kitchen_ticket", orderId };
  }
}
