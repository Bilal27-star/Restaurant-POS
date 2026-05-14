import { prisma } from "../../prisma/index.js";

/** Validates IANA zone names; falls back to UTC on invalid input. */
export function sanitizeIanaTimeZone(raw: string | null | undefined): string {
  const t = (raw ?? "UTC").trim() || "UTC";
  if (!/^[A-Za-z0-9_/+\-]+$/.test(t)) {
    return "UTC";
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone: t }).format(new Date());
    return t;
  } catch {
    return "UTC";
  }
}

export async function getRestaurantTimeZone(restaurantId: string): Promise<string> {
  const r = await prisma.restaurant.findFirst({
    where: { id: restaurantId, deletedAt: null },
    select: { timezone: true },
  });
  return sanitizeIanaTimeZone(r?.timezone);
}

export async function getRestaurantCurrency(restaurantId: string): Promise<string> {
  const r = await prisma.restaurant.findFirst({
    where: { id: restaurantId, deletedAt: null },
    select: { currencyCode: true },
  });
  return r?.currencyCode?.trim() || "DZD";
}

/**
 * Calendar day bounds in the restaurant timezone, returned as UTC instants for DB filtering.
 * [startUtc, endUtc) — end is exclusive.
 */
export async function businessDayBoundsUtc(
  restaurantId: string,
  instant: Date,
): Promise<{ startUtc: Date; endUtc: Date; timeZone: string }> {
  const timeZone = await getRestaurantTimeZone(restaurantId);
  const tzLiteral = timeZone.replace(/'/g, "''");
  const rows = await prisma.$queryRawUnsafe<{ start_utc: Date; end_utc: Date }[]>(
    `SELECT
      (date_trunc('day', $1::timestamptz AT TIME ZONE '${tzLiteral}') AT TIME ZONE '${tzLiteral}') AS start_utc,
      ((date_trunc('day', $1::timestamptz AT TIME ZONE '${tzLiteral}') + interval '1 day') AT TIME ZONE '${tzLiteral}') AS end_utc`,
    instant,
  );
  const row = rows[0];
  if (!row) {
    throw new Error("ANALYTICS_DAY_BOUNDS_FAILED");
  }
  return { startUtc: row.start_utc, endUtc: row.end_utc, timeZone };
}
