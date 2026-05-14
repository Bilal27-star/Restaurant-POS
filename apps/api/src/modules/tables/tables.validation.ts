import { z } from "zod";

const uuid = z.string().uuid();

export const tableStatusZ = z.enum(["FREE", "OCCUPIED", "RESERVED", "PAYMENT_PENDING"]);

export const createFloorBody = z
  .object({
    name: z.string().min(1).max(120),
    sortOrder: z.coerce.number().int().min(0).max(999).optional().default(0),
  })
  .strict();

export const patchFloorBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  })
  .strict();

export const createTableBody = z
  .object({
    floorId: uuid.nullable().optional(),
    number: z.string().min(1).max(32),
    capacity: z.coerce.number().int().min(1).max(99),
  })
  .strict();

export const patchTableBody = z
  .object({
    number: z.string().min(1).max(32).optional(),
    capacity: z.coerce.number().int().min(1).max(99).optional(),
    floorId: uuid.nullable().optional(),
    status: tableStatusZ.optional(),
  })
  .strict();

export const floorIdParams = z.object({ floorId: uuid }).strict();
export const tableIdParams = z.object({ tableId: uuid }).strict();
