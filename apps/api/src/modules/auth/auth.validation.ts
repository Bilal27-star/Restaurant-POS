import { z } from "zod";

/** Login accepts whatever the account was created with; strength rules belong on create/reset flows only. */
const loginPasswordField = z.string().min(1, "Password is required").max(256);

const pinField = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");

/** Normalize body: `slug` is an alias for `restaurantSlug` (manual tools / older clients). */
export const loginBodySchema = z
  .object({
    restaurantSlug: z.string().min(1).max(120).optional(),
    slug: z.string().min(1).max(120).optional(),
    username: z.string().min(1).max(80),
    password: z.string().optional(),
    pin: pinField.optional(),
  })
  .transform((d) => {
    const restaurantSlug = (d.restaurantSlug ?? d.slug ?? "").trim();
    return {
      restaurantSlug,
      username: d.username,
      password: d.password,
      pin: d.pin,
    };
  })
  .pipe(
    z
      .object({
        restaurantSlug: z.string().min(1).max(120),
        username: z.string().min(1).max(80),
        password: z.string().optional(),
        pin: pinField.optional(),
      })
      .superRefine((data, ctx) => {
        const hasPassword = data.password !== undefined && data.password.length > 0;
        const hasPin = data.pin !== undefined && data.pin.length > 0;
        if (hasPassword === hasPin) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Provide exactly one of password or pin",
            path: ["password"],
          });
        }
        if (hasPassword && data.password) {
          const r = loginPasswordField.safeParse(data.password);
          if (!r.success) {
            for (const iss of r.error.issues) {
              ctx.addIssue({ ...iss, path: ["password"] });
            }
          }
        }
      }),
  );

export type LoginBody = z.infer<typeof loginBodySchema>;

export const refreshBodySchema = z
  .object({
    refreshToken: z.string().min(20).optional(),
  })
  .strict();

export const logoutBodySchema = z
  .object({
    refreshToken: z.string().min(20).optional(),
  })
  .strict();
