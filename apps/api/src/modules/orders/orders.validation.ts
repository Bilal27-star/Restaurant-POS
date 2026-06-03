import { z } from "zod";

import { paymentMethodApiZ } from "../payments/payments.validation.js";

const uuid = z.string().uuid();

export const orderTypeZ = z.enum(["DINE_IN", "TAKEAWAY"]);
export const orderStatusZ = z.enum(["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"]);

/** Strip client-side print routing fields that must not be persisted on order lines. */
function stripOrderLineRoutingFields(val: unknown): unknown {
  if (!val || typeof val !== "object" || Array.isArray(val)) return val;
  const { station: _station, waiterName: _waiterName, ...rest } = val as Record<string, unknown>;
  return rest;
}

const orderLineInput = z.preprocess(
  stripOrderLineRoutingFields,
  z
    .object({
      menuItemId: uuid,
      quantity: z.coerce.number().int().min(1).max(999),
      modifierIds: z.array(uuid).optional().default([]),
      removedIngredientIds: z.array(uuid).optional().default([]),
      kitchenNotes: z.string().max(2000).optional().nullable(),
    })
    .strict(),
);

export const createOrderBody = z
  .object({
    type: orderTypeZ,
    tableId: uuid.optional().nullable(),
    customerId: uuid.optional().nullable(),
    waiterId: uuid.optional().nullable(),
    partySize: z.coerce.number().int().min(1).max(99).optional().nullable(),
    waiterName: z.string().max(120).optional().nullable(),
    kitchenNotes: z.string().max(4000).optional().nullable(),
    customerNotes: z.string().max(4000).optional().nullable(),
    taxTotal: z.coerce.string().optional(),
    discountTotal: z.coerce.string().optional(),
    /** Offline outbox / sync: stable id for exactly-once create per restaurant. */
    clientMutationId: z.string().min(8).max(128).optional().nullable(),
    lines: z.array(orderLineInput).min(1).max(200),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === "DINE_IN" && !data.tableId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tableId is required for DINE_IN orders",
        path: ["tableId"],
      });
    }
    if (data.type === "TAKEAWAY" && data.tableId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tableId must not be set for TAKEAWAY orders",
        path: ["tableId"],
      });
    }
  });

export const orderIdParams = z.object({ orderId: uuid }).strict();

export const orderLineIdParams = z
  .object({
    orderId: uuid,
    lineId: uuid,
  })
  .strict();

const versionOpt = z.object({
  version: z.coerce.number().int().min(1).optional(),
});

export const patchOrderBody = z
  .object({
    kitchenNotes: z.string().max(4000).optional().nullable(),
    customerNotes: z.string().max(4000).optional().nullable(),
    status: orderStatusZ.optional(),
    customerId: uuid.optional().nullable(),
    waiterId: uuid.optional().nullable(),
    partySize: z.coerce.number().int().min(1).max(99).optional().nullable(),
    waiterName: z.string().max(120).optional().nullable(),
    taxTotal: z.coerce.string().optional().nullable(),
    discountTotal: z.coerce.string().optional().nullable(),
  })
  .strict()
  .merge(versionOpt);

const clientMutationIdOpt = z.object({
  /** Offline outbox / sync: stable id for exactly-once line mutations per restaurant. */
  clientMutationId: z.string().min(8).max(128).optional().nullable(),
});

export const addOrderLinesBody = z
  .object({
    lines: z.array(orderLineInput).min(1).max(100),
  })
  .strict()
  .merge(versionOpt)
  .merge(clientMutationIdOpt);

export const patchOrderLineBody = z
  .object({
    quantity: z.coerce.number().int().min(1).max(999).optional(),
    modifierIds: z.array(uuid).optional(),
    removedIngredientIds: z.array(uuid).optional(),
    kitchenNotes: z.string().max(2000).optional().nullable(),
  })
  .strict()
  .merge(versionOpt)
  .merge(clientMutationIdOpt);

export const recordPaymentBody = z
  .object({
    method: paymentMethodApiZ,
    amount: z.coerce.string(),
    amountReceived: z.coerce.string().optional().nullable(),
    idempotencyKey: z.string().max(200).optional().nullable(),
  })
  .strict()
  .merge(versionOpt);

export const listOrdersQuery = z
  .object({
    type: orderTypeZ.optional(),
    status: orderStatusZ.optional(),
    tableId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).max(10000).optional().default(0),
  })
  .strict();

export const searchOrdersQuery = z
  .object({
    q: z.string().min(1).max(120),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
    offset: z.coerce.number().int().min(0).max(5000).optional().default(0),
  })
  .strict();

export const historyOrdersQuery = z
  .object({
    type: orderTypeZ.optional(),
    status: z.enum(["COMPLETED", "CANCELLED"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    offset: z.coerce.number().int().min(0).max(10000).optional().default(0),
  })
  .strict();

export const optionalVersionBody = z
  .object({
    version: z.coerce.number().int().min(1).optional(),
  })
  .strict();

export const completeOrderBody = z.preprocess((v) => (v == null ? {} : v), optionalVersionBody);

export const cancelOrderBody = z.preprocess((v) => (v == null ? {} : v), optionalVersionBody);

export const deleteLineQuery = z
  .object({
    version: z.coerce.number().int().min(1).optional(),
    clientMutationId: z.string().min(8).max(128).optional().nullable(),
  })
  .strict();

export const fullKitchenReprintBody = z
  .object({
    clientMutationId: z.string().min(8).max(128),
    lineIds: z.array(uuid).max(200).optional(),
  })
  .strict();

export const dispatchPendingKitchenBody = z
  .object({
    clientMutationId: z.string().min(8).max(128),
    version: z.coerce.number().int().min(1).optional(),
  })
  .strict();
