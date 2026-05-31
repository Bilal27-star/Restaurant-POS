export const OPEN_CASH_DRAWER_AFTER_PAYMENT_KEY = "openCashDrawerAfterPayment";

export function readOpenCashDrawerAfterPayment(settingsJson: Record<string, unknown> | null | undefined): boolean {
  if (!settingsJson) return true;
  const v = settingsJson[OPEN_CASH_DRAWER_AFTER_PAYMENT_KEY];
  if (v === undefined) return true;
  return v === true;
}

export function buildCashDrawerSettingsPatch(enabled: boolean): Record<string, unknown> {
  return { [OPEN_CASH_DRAWER_AFTER_PAYMENT_KEY]: enabled };
}
