import { buildTableTicketEscPosBytes } from "./table-ticket-escpos";
import type { TableTicketQrPayloadV1 } from "./table-ticket-qr";
import { encodeTableTicketQrPayloadV1 } from "./table-ticket-qr";

export type TableIdentificationTicketInput = {
  restaurantName: string;
  /** e.g. "T12" */
  tableDisplay: string;
  /** e.g. "#4821" */
  orderDisplay: string;
  waiterName: string;
  printedAt: Date;
  ticketPublicCode: string;
  /** Correlation ids for future QR / API. */
  qrPayload: TableTicketQrPayloadV1;
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildTableTicketHtml(input: TableIdentificationTicketInput): string {
  const time = input.printedAt.toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const qrAttr = encodeTableTicketQrPayloadV1(input.qrPayload);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Ticket table</title>
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
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .rule { border-top: 1px dashed #000; margin: 6px 0; }
    .muted { font-size: 9px; color: #333; margin-top: 8px; }
    .code { letter-spacing: 0.12em; font-weight: 700; font-size: 12px; margin-top: 4px; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <pre>${escapeHtml(input.restaurantName)}

================================
Table: ${escapeHtml(input.tableDisplay)}
Order: ${escapeHtml(input.orderDisplay)}
Waiter: ${escapeHtml(input.waiterName)}
Time: ${escapeHtml(time)}
================================
Code: ${escapeHtml(input.ticketPublicCode)}
</pre>
  <div class="rule" aria-hidden="true"></div>
  <p class="muted">Ticket d'identification — pas la facture.</p>
  <!-- QR hook: render QR from data-ticket-qr when scanner flow ships -->
  <div id="ticket-qr-anchor" data-ticket-qr-v1="${escapeHtml(qrAttr)}" style="display:none" aria-hidden="true"></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},120);};</script>
</body>
</html>`;
}

export function printTableIdentificationTicket(input: TableIdentificationTicketInput): boolean {
  const html = buildTableTicketHtml(input);
  const esc = buildTableTicketEscPosBytes({
    restaurantName: input.restaurantName,
    tableLine: `Table: ${input.tableDisplay}`,
    orderLine: `Order: ${input.orderDisplay}`,
    waiterLine: `Waiter: ${input.waiterName}`,
    timeLine: `Time: ${input.printedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    codeLine: `Code: ${input.ticketPublicCode}`,
  });
  void esc;

  const w = window.open("", "_blank", "noopener,noreferrer,width=360,height=640");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
