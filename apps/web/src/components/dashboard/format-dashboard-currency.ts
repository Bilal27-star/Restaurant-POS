/** Formats numeric strings from the API using restaurant currency (ISO 4217). */
export function formatDashboardCurrency(amount: string, currencyCode: string): string {
  const n = Number.parseFloat(amount);
  if (!Number.isFinite(n)) {
    return amount;
  }
  try {
    return new Intl.NumberFormat("fr-DZ", {
      style: "currency",
      currency: currencyCode.length === 3 ? currencyCode : "DZD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currencyCode}`;
  }
}

export function formatDashboardNumber(n: number): string {
  return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n);
}
