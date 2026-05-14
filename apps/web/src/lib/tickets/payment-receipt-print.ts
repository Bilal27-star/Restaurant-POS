/** Printable cashier receipt (58mm-style HTML). Matches API `payment_receipt` document shape. */

export type PaymentReceiptPrintLine = {
  description: string;
  quantity: number;
  lineTotal: string;
  modifierLabels: string | null;
};

export type PaymentReceiptPrintDocument = {
  kind: "payment_receipt";
  restaurantName: string;
  orderNumber: string;
  tableNumber: string | null;
  paymentMethod: string;
  amountApplied: string;
  amountTendered: string | null;
  changeGiven: string | null;
  orderSubtotal: string;
  orderTax: string;
  orderDiscount: string;
  orderTotal: string;
  netPaidAfter: string;
  lines: PaymentReceiptPrintLine[];
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildPaymentReceiptHtml(doc: PaymentReceiptPrintDocument, printedAt: Date): string {
  const time = printedAt.toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const tableLine = doc.tableNumber ? `Table: ${escapeHtml(doc.tableNumber)}` : "";
  const linesBlock = doc.lines
    .map((l) => {
      const mods =
        l.modifierLabels && l.modifierLabels.trim().length > 0
          ? `\n  ${escapeHtml(l.modifierLabels)}`
          : "";
      return `${l.quantity}× ${escapeHtml(l.description)}${mods}\n   ${escapeHtml(l.lineTotal)} DA`;
    })
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Reçu</title>
  <style>
    @page { size: 58mm auto; margin: 2mm; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      width: 54mm;
      max-width: 54mm;
      padding: 4mm 3mm;
      box-sizing: border-box;
    }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
    .rule { border-top: 1px dashed #000; margin: 6px 0; }
    .muted { font-size: 9px; color: #333; margin-top: 8px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <pre>${escapeHtml(doc.restaurantName)}

================================
${tableLine}${tableLine ? "\n" : ""}Commande: ${escapeHtml(doc.orderNumber)}
${escapeHtml(time)}
================================
${linesBlock}

--------------------------------
Sous-total TTC: ${escapeHtml(doc.orderSubtotal)} DA
TVA: ${escapeHtml(doc.orderTax)} DA
Remise: ${escapeHtml(doc.orderDiscount)} DA
TOTAL: ${escapeHtml(doc.orderTotal)} DA
Payé (cumul): ${escapeHtml(doc.netPaidAfter)} DA
--------------------------------
Moyen: ${escapeHtml(doc.paymentMethod)}
Montant encaissé: ${escapeHtml(doc.amountApplied)} DA
${doc.amountTendered ? `Reçu: ${escapeHtml(doc.amountTendered)} DA` : ""}
${doc.changeGiven ? `Rendu: ${escapeHtml(doc.changeGiven)} DA` : ""}
</pre>
  <div class="rule" aria-hidden="true"></div>
  <p class="muted">Merci de votre visite.</p>
</body>
</html>`;
}

export function openPaymentReceiptPrintWindow(doc: PaymentReceiptPrintDocument): boolean {
  const html = buildPaymentReceiptHtml(doc, new Date());
  const w = window.open("", "_blank", "noopener,noreferrer,width=360,height=640");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
