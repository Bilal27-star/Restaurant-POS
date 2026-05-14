import type { PrintJobKind } from "@prisma/client";

import type { ThermalDocument } from "./documents/types.js";
import { renderCustomerReceiptEscPos } from "./templates/customer-receipt.js";
import { renderExpenseReceiptEscPos } from "./templates/expense-receipt.js";
import { renderKitchenTicketEscPos } from "./templates/kitchen-ticket.js";
import { renderShiftSummaryEscPos } from "./templates/shift-summary.js";
import { renderTableTicketEscPos } from "./templates/table-ticket.js";

export function renderThermalEscPos(kind: PrintJobKind, doc: ThermalDocument, paperWidthChars: number): Uint8Array {
  switch (kind) {
    case "TABLE_TICKET":
      if (doc.kind !== "TABLE_TICKET") throw new Error("PAYLOAD_KIND_MISMATCH");
      return renderTableTicketEscPos(doc, paperWidthChars);
    case "KITCHEN_TICKET":
      if (doc.kind !== "KITCHEN_TICKET") throw new Error("PAYLOAD_KIND_MISMATCH");
      return renderKitchenTicketEscPos(doc, paperWidthChars);
    case "CUSTOMER_RECEIPT":
      if (doc.kind !== "CUSTOMER_RECEIPT") throw new Error("PAYLOAD_KIND_MISMATCH");
      return renderCustomerReceiptEscPos(doc, paperWidthChars);
    case "SHIFT_SUMMARY":
      if (doc.kind !== "SHIFT_SUMMARY") throw new Error("PAYLOAD_KIND_MISMATCH");
      return renderShiftSummaryEscPos(doc, paperWidthChars);
    case "EXPENSE_RECEIPT":
      if (doc.kind !== "EXPENSE_RECEIPT") throw new Error("PAYLOAD_KIND_MISMATCH");
      return renderExpenseReceiptEscPos(doc, paperWidthChars);
    default:
      throw new Error("UNKNOWN_PRINT_KIND");
  }
}
