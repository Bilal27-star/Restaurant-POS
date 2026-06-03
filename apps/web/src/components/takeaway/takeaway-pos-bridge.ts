import type { PosCartLineItem } from "@/components/pos/pos-cart-types";
import type { TakeawayCustomerDraft } from "./takeaway-customer-validation";
import { isValidAlgeriaMobile } from "./takeaway-phone-utils";
import type { TakeawayOrderLineItem } from "./takeaway-order-types";

export function cartLinesToTakeawayItems(lines: PosCartLineItem[]): TakeawayOrderLineItem[] {
  return lines.map((l) => ({ quantity: l.quantity, name: l.name }));
}

export function buildTakeawayKitchenNotes(lines: PosCartLineItem[]): string {
  const lineParts = lines.map((l) => l.notes.trim()).filter(Boolean);
  if (!lineParts.length) return "";
  return `Ligne:\n${lineParts.map((n) => `· ${n}`).join("\n")}`;
}

/** Free-text order notes when no linked customer record (all POS takeaway fields optional). */
export function buildTakeawayOrderCustomerNotes(draft: TakeawayCustomerDraft): string | null {
  const parts: string[] = [];
  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const address = draft.address.trim();
  const notes = draft.notes.trim();
  if (name) parts.push(`Client: ${name}`);
  if (phone) parts.push(`Tél: ${phone}`);
  if (address) parts.push(`Adresse: ${address}`);
  if (notes) parts.push(notes);
  if (parts.length === 0) return null;
  return parts.join("\n");
}

/** Upsert payload when staff provided identifiable customer info; otherwise null. */
export function buildOptionalTakeawayCustomerUpsert(
  draft: TakeawayCustomerDraft,
): { name: string; phone?: string; address?: string; notes?: string } | null {
  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const address = draft.address.trim();
  const notes = draft.notes.trim();
  const phoneValid = phone.length > 0 && isValidAlgeriaMobile(phone);

  if (name.length >= 2) {
    return {
      name,
      ...(phoneValid ? { phone } : {}),
      ...(address ? { address } : {}),
      ...(notes ? { notes } : {}),
    };
  }
  if (phoneValid) {
    return {
      name: "Client",
      phone,
      ...(address ? { address } : {}),
      ...(notes ? { notes } : {}),
    };
  }
  return null;
}
