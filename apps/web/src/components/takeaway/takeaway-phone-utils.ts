/** Algeria-oriented mobile formatting (POS default). Keeps logic in one place for future i18n. */

const DZ_CC = "213";
const MAX_NATIONAL_MOBILE = 9;

/** Digits only, normalized toward `213` + 9-digit mobile body when possible. */
export function normalizeAlgeriaMobileDigits(input: string): string {
  let d = input.replace(/\D/g, "");
  if (!d) return "";

  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith(DZ_CC)) {
    return d.slice(0, 3 + MAX_NATIONAL_MOBILE);
  }
  if (d.startsWith("0")) {
    d = d.slice(1);
  }
  if (d.length <= MAX_NATIONAL_MOBILE && /^[567]/.test(d)) {
    return `${DZ_CC}${d}`.slice(0, 3 + MAX_NATIONAL_MOBILE);
  }
  if (d.length > MAX_NATIONAL_MOBILE && !d.startsWith(DZ_CC)) {
    d = d.slice(0, MAX_NATIONAL_MOBILE);
    return `${DZ_CC}${d}`;
  }
  return d.startsWith(DZ_CC) ? d.slice(0, 3 + MAX_NATIONAL_MOBILE) : d;
}

/** Display string for controlled phone input, e.g. `+213 555 12 34 56`. */
export function formatAlgeriaPhoneDisplay(input: string): string {
  const full = normalizeAlgeriaMobileDigits(input);
  if (!full.startsWith(DZ_CC)) {
    return full ? `+${full}` : "";
  }
  const body = full.slice(3);
  if (!body) return "+213";
  const a = body.slice(0, 3);
  const b = body.slice(3, 5);
  const c = body.slice(5, 7);
  const e = body.slice(7, 9);
  const rest = [a, b, c, e].filter(Boolean).join(" ");
  return `+213 ${rest}`.trim();
}

export function isValidAlgeriaMobile(input: string): boolean {
  const n = normalizeAlgeriaMobileDigits(input);
  if (!n.startsWith(DZ_CC)) return false;
  const body = n.slice(3);
  if (body.length !== MAX_NATIONAL_MOBILE) return false;
  return /^[567]\d{8}$/.test(body);
}

/** Compare / dedupe saved customers. */
export function phoneKey(input: string): string {
  return normalizeAlgeriaMobileDigits(input);
}
