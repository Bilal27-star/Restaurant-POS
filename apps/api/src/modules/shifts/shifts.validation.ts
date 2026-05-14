import { z } from "zod";

const moneyStr = z.union([z.string(), z.number()]).transform((v) => String(v));

export const openShiftBody = z
  .object({
    openingCashFloat: moneyStr,
  })
  .strict();

export const closeShiftBody = z
  .object({
    closingCashCount: moneyStr,
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const shiftIdParams = z.object({ shiftId: z.string().uuid() });
