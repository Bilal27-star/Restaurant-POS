/**
 * Client-side helpers for ESC/POS dispatch metadata (matches Tauri `print_dispatch` + API `RestaurantPrinter.connectionJson`).
 */

export const THERMAL_WIDTH_58MM = 32;
export const THERMAL_WIDTH_80MM = 48;

/** Wraps printer `connectionJson` for `print_escpos_base64` metaJson. */
export function buildPrintDispatchMeta(connectionJson: Record<string, unknown>): { connection: Record<string, unknown> } {
  return { connection: connectionJson };
}
