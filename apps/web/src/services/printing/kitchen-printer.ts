import { getAppApi } from "@/lib/app-api";
import { sendEscPosViaBridge } from "@/lib/print/print-bridge";
import { buildPrintDispatchMeta } from "./esc-pos-formatter";
import { PrintQueue } from "./print-queue";

const queue = new PrintQueue();

export class KitchenPrinter {
  static async printTestPage(printerId: string): Promise<void> {
    const api = getAppApi();
    const printers = (await api.print.listPrinters()) as Array<{
      id: string;
      connectionJson: Record<string, unknown>;
    }>;
    const p = printers.find((x) => x.id === printerId);
    if (!p) throw new Error("Printer not found");

    const payload = {
      kind: "KITCHEN_TICKET" as const,
      restaurantName: "Test restaurant",
      orderNumber: "2026-000099",
      tableNumber: "5",
      orderType: "DINE_IN",
      printedAtIso: new Date().toISOString(),
      orderKitchenNotes: null,
      lines: [
        {
          qty: 1,
          name: "Burger test",
          modifiers: [{ label: "Cheddar" }],
          removedIngredients: ["Oignon"],
          kitchenNotes: "Bien cuit",
        },
      ],
    };

    const rendered = (await api.print.render({
      kind: "KITCHEN_TICKET",
      printerId,
      payload,
    })) as { escposBase64: string };

    await queue.enqueue(async () => {
      await sendEscPosViaBridge(rendered.escposBase64, buildPrintDispatchMeta(p.connectionJson));
    });
  }
}
