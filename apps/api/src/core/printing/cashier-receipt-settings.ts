/** `systemSettings.settingsJson.openCashDrawerAfterPayment` — cashier receipt drawer pulse after payment. */
export const OPEN_CASH_DRAWER_AFTER_PAYMENT_KEY = "openCashDrawerAfterPayment";

/** Default true for backward compatibility with prior cash-sale drawer behavior. */
export function isOpenCashDrawerAfterPaymentEnabled(settingsJson: unknown): boolean {
  if (!settingsJson || typeof settingsJson !== "object") return true;
  const v = (settingsJson as Record<string, unknown>)[OPEN_CASH_DRAWER_AFTER_PAYMENT_KEY];
  if (v === undefined) return true;
  return v === true;
}
