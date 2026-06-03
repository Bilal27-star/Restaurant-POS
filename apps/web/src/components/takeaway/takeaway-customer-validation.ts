import { isValidAlgeriaMobile } from "./takeaway-phone-utils";

export type TakeawayCustomerDraft = {
  name: string;
  phone: string;
  address: string;
  notes: string;
};

export type TakeawayCustomerFieldErrorKey = "name" | "phone" | "address";

/** Strict validation for future delivery-required flows (not used for POS kitchen send). */
export function validateTakeawayCustomerDraft(d: TakeawayCustomerDraft): Partial<Record<TakeawayCustomerFieldErrorKey, string>> {
  const errors: Partial<Record<TakeawayCustomerFieldErrorKey, string>> = {};
  const name = d.name.trim();
  if (name.length < 2) errors.name = "Nom requis (2 caractères min.)";
  if (!isValidAlgeriaMobile(d.phone)) errors.phone = "Numéro mobile DZ invalide (ex. +213 5XX XX XX XX)";
  const addr = d.address.trim();
  if (addr.length < 5) errors.address = "Adresse de livraison requise (5 caractères min.)";
  return errors;
}
