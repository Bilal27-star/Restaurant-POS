import type { PosCartLineItem } from "@/components/pos/pos-cart-types";
import type { TakeawayCustomerDraft } from "./takeaway-customer-validation";
import { formatAlgeriaPhoneDisplay, isValidAlgeriaMobile } from "./takeaway-phone-utils";
import type { TakeawayOrderLineItem } from "./takeaway-order-types";
import type { SerializedTakeawayOrder } from "@/types/serialized-order";

const emptyTakeawayDraft: TakeawayCustomerDraft = { name: "", phone: "", address: "", notes: "" };

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

/** Hydrate POS takeaway customer fields from `GET /orders/:id` or board order row. */
export function takeawayDraftFromOrderDetail(raw: unknown): TakeawayCustomerDraft {
  if (!raw || typeof raw !== "object") {
    return { ...emptyTakeawayDraft };
  }
  const o = raw as SerializedTakeawayOrder & Record<string, unknown>;
  const draft = { ...emptyTakeawayDraft };
  const customer = o.customer;
  if (customer && typeof customer === "object") {
    draft.name = customer.name?.trim() ?? "";
    draft.phone = customer.phone ? formatAlgeriaPhoneDisplay(String(customer.phone)) : "";
    draft.address = customer.address?.trim() ?? "";
    draft.notes = customer.notes?.trim() ?? "";
    return draft;
  }
  return draft;
}

export function isTakeawayOrderEditable(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.type !== "TAKEAWAY") return false;
  const status = o.status;
  return status !== "COMPLETED" && status !== "CANCELLED";
}
