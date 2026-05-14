import { PaymentMethod } from "@prisma/client";
import { z } from "zod";

const moneyStr = z.union([z.string(), z.number()]).transform((v) => String(v));

export const createExpenseBody = z
  .object({
    shiftId: z.string().uuid(),
    categoryId: z.string().uuid(),
    amount: moneyStr,
    description: z.string().min(1).max(2000),
    paymentMethod: z.nativeEnum(PaymentMethod),
  })
  .strict();

export const listExpensesQuery = z
  .object({
    shiftId: z.string().uuid(),
  })
  .strict();
