import { getAppApi } from "@/lib/app-api";
import { isTauriDesktop } from "@/lib/desktop/tauri-host";
import {
  type PaymentReceiptPrintDocument,
  openPaymentReceiptPrintWindow,
} from "@/lib/tickets/payment-receipt-print";

/**
 * Client-side receipt output after payment.
 *
 * Thermal dispatch on desktop is owned by the API: `POST /payments/checkout` → `capture` →
 * `HardwarePrintOrchestrator.scheduleReceiptAfterCapture` → print queue → `ThermalPrintWorker`.
 * Do not call `reprintReceipt` again after checkout on Tauri (that created duplicate jobs).
 */
export class PrinterService {
  /**
   * After a successful checkout mutation. Browser POS opens an HTML print window; Tauri relies on
   * the server-enqueued CUSTOMER_RECEIPT job (no second `POST …/print/receipt`).
   */
  static async afterSuccessfulCheckout(paymentId: string): Promise<boolean> {
    if (isTauriDesktop()) {
      return true;
    }
    return PrinterService.openBrowserReceiptFromPaymentId(paymentId);
  }

  /** Manual reprint from caisse/history — always requests a new print job (Tauri) or browser window. */
  static async reprintCashierReceipt(paymentId: string): Promise<boolean> {
    if (isTauriDesktop()) {
      try {
        await getAppApi().payments.reprintReceipt(paymentId);
        return true;
      } catch {
        return false;
      }
    }
    return PrinterService.openBrowserReceiptFromPaymentId(paymentId);
  }

  /** @deprecated Use `afterSuccessfulCheckout` or `reprintCashierReceipt`. */
  static async printCashierReceiptFromPaymentId(paymentId: string): Promise<boolean> {
    return PrinterService.reprintCashierReceipt(paymentId);
  }

  private static async openBrowserReceiptFromPaymentId(paymentId: string): Promise<boolean> {
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
