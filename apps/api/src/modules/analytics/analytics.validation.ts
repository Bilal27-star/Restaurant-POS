import { z } from "zod";

export const analyticsOverviewQuery = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

const isoDate = z.string().min(4);

export const analyticsDateRangeQuery = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .strict();

export const analyticsRevenueQuery = z
  .object({
    from: isoDate,
    to: isoDate,
    granularity: z.enum(["hour", "day", "week"]).optional(),
  })
  .strict();

export const analyticsTopItemsQuery = analyticsDateRangeQuery.extend({
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});
