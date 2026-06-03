import { z } from "zod";

export const customerSearchQuery = z.object({
  q: z.string().optional().default(""),
});

export const upsertCustomerBody = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});
