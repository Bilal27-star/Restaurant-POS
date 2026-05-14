/**
 * Minimal ESC/POS byte builder for 58mm thermal printers.
 * Wire to USB/BT bridge later; for now the web app uses HTML print.
 */

const ESC = "\x1B";
const GS = "\x1D";

export type EscPosTableTicketInput = {
  restaurantName: string;
  tableLine: string;
  orderLine: string;
  waiterLine: string;
  timeLine: string;
  codeLine: string;
};

/** Reset printer, print text block, feed, partial cut. */
export function buildTableTicketEscPosBytes(input: EscPosTableTicketInput): Uint8Array {
  const lines = [
    input.restaurantName,
    "================================",
    input.tableLine,
    input.orderLine,
    input.waiterLine,
    input.timeLine,
    input.codeLine,
    "================================",
    "",
    "Ticket identification —",
    "pas facture",
    "",
  ];

  const parts: number[] = [];
  const pushStr = (s: string) => {
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      if (c > 0xff) {
        parts.push(0x3f);
      } else {
        parts.push(c);
      }
    }
    parts.push(0x0a);
  };

  parts.push(...Array.from(`${ESC}@`, (ch) => ch.charCodeAt(0)));
  parts.push(0x0a);
  for (const line of lines) {
    pushStr(line);
  }
  parts.push(0x0a, 0x0a, 0x0a);
  // Partial cut (common on thermal drivers)
  parts.push(GS.charCodeAt(0), "V".charCodeAt(0), 0x42, 0x00);

  return Uint8Array.from(parts);
}
