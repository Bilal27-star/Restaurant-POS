import { z } from "zod";

export const patchSystemSettingsBody = z
  .object({
    restaurantName: z.string().min(1).max(200).optional(),
    address: z.string().max(500).nullable().optional(),
    phone: z.string().max(80).nullable().optional(),
    settingsJson: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((o) => o.restaurantName !== undefined || o.address !== undefined || o.phone !== undefined || o.settingsJson !== undefined, {
    message: "At least one field required",
  });
