import { getAppApi } from "@/lib/app-api";
import { sendEscPosViaBridge } from "@/lib/print/print-bridge";
import { buildPrintDispatchMeta } from "./esc-pos-formatter";
import { PrintQueue } from "./print-queue";

const queue = new PrintQueue();

export class ReceiptPrinter {
  /** Renders a customer receipt on the server and sends bytes to the local bridge (test / manual). */
  static async printTestPage(printerId: string): Promise<void> {
    const api = getAppApi();
    const printers = (await api.print.listPrinters()) as Array<{
      id: string;
      role: string;
      connectionJson: Record<string, unknown>;
    }>;
    const p = printers.find((x) => x.id === printerId);
    if (!p) throw new Error("Printer not found");

    const payload = {
      kind: "CUSTOMER_RECEIPT" as const,
      restaurantName: "Test restaurant",
      addressLine: "1 rue du test",
      phoneLine: "+213 000 00 00 00",
      orderNumber: "TEST-000001",
      tableNumber: "12",
      printedAtIso: new Date().toISOString(),
      lines: [
        { name: "Plat test", qty: 2, unitPrice: "450.00", lineTotal: "900.00", modifiers: ["+ Sauce"] },
      ],
      subtotal: "900.00",
      taxTotal: "0.00",
      discountTotal: "0.00",
      total: "900.00",
      paymentMethod: "Espèces",
      amountPaid: "900.00",
      changeGiven: "100.00",
      cashTendered: "1000.00",
      cashierName: "Test",
      openCashDrawerBeforeCut: false,
    };

    const rendered = (await api.print.render({
      kind: "CUSTOMER_RECEIPT",
      printerId,
      payload,
    })) as { escposBase64: string };

    await queue.enqueue(async () => {
      await sendEscPosViaBridge(rendered.escposBase64, buildPrintDispatchMeta(p.connectionJson));
    });
  }
}
