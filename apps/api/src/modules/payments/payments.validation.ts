import { z } from "zod";

const uuid = z.string().uuid();

/** API accepts BANK_TRANSFER; persisted as Prisma enum TRANSFER. */
export const paymentMethodApiZ = z.enum(["CASH", "CARD", "BANK_TRANSFER", "TRANSFER"]);

export function toPrismaPaymentMethod(m: z.infer<typeof paymentMethodApiZ>): "CASH" | "CARD" | "TRANSFER" {
  if (m === "BANK_TRANSFER" || m === "TRANSFER") return "TRANSFER";
  return m;
}

export const capturePaymentBody = z
  .object({
    orderId: uuid,
    method: paymentMethodApiZ,
    amount: z.coerce.string(),
    amountReceived: z.coerce.string().optional().nullable(),
    orderVersion: z.coerce.number().int().min(1).optional(),
    idempotencyKey: z.string().max(200).optional().nullable(),
    autoCompleteOrder: z.coerce.boolean().optional().default(true),
  })
  .strict();

export const cashPreviewQuery = z
  .object({
    bill: z.coerce.string(),
    tendered: z.coerce.string(),
  })
  .strict();

export const searchPaymentsQuery = z
  .object({
    q: z.string().min(1).max(120),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
    offset: z.coerce.number().int().min(0).max(5000).optional().default(0),
  })
  .strict();

export const checkoutPaymentBody = z
  .object({
    orderId: uuid,
    method: z.enum(["CASH", "CARD"]),
    cashReceived: z.coerce.string().optional().nullable(),
    orderVersion: z.coerce.number().int().min(1).optional(),
    idempotencyKey: z.string().max(200).optional().nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.method === "CASH") {
      const s = data.cashReceived?.trim() ?? "";
      if (!s) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "cashReceived is required for CASH",
          path: ["cashReceived"],
        });
      }
    }
  });

export const paymentIdParams = z.object({ paymentId: uuid }).strict();

export const refundPaymentBody = z
  .object({
    amount: z.coerce.string(),
    reason: z.string().max(2000).optional().nullable(),
  })
  .strict();
