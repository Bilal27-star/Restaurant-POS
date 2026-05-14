import type { PosCartLineItem } from "@/components/pos/pos-cart-types";
import type { TakeawayOrderLineItem } from "./takeaway-order-types";

export function cartLinesToTakeawayItems(lines: PosCartLineItem[]): TakeawayOrderLineItem[] {
  return lines.map((l) => ({ quantity: l.quantity, name: l.name }));
}

export function buildTakeawayKitchenNotes(lines: PosCartLineItem[]): string {
  const lineParts = lines.map((l) => l.notes.trim()).filter(Boolean);
  if (!lineParts.length) return "";
  return `Ligne:\n${lineParts.map((n) => `· ${n}`).join("\n")}`;
}
