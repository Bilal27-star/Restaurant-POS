import { z } from "zod";

export const testPrinterConnectionBody = z
  .object({
    host: z.string().min(1).max(253),
    port: z.coerce.number().int().min(1).max(65535).optional(),
  })
  .strict();
