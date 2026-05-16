import { z } from "zod";

const uuid = z.string().uuid();

export const createUserBody = z
  .object({
    fullName: z.string().min(1).max(120),
    username: z.string().min(2).max(64),
    password: z.string().min(6).max(128),
    phone: z.string().max(40).optional(),
    email: z.union([z.string().email().max(254), z.literal("")]).optional(),
    role: z.enum(["ADMIN", "MANAGER", "CASHIER", "WAITER"]),
    status: z.enum(["ACTIVE", "INVITED", "SUSPENDED", "VACATION", "DEACTIVATED"]).optional(),
  })
  .strict();

export const patchUserBody = z
  .object({
    fullName: z.string().min(1).max(120).optional(),
    username: z.string().min(2).max(64).optional(),
    password: z.string().min(6).max(128).optional(),
    phone: z.string().max(40).optional(),
    email: z.union([z.string().email().max(254), z.literal("")]).optional(),
    role: z.enum(["ADMIN", "MANAGER", "CASHIER", "WAITER"]).optional(),
    status: z.enum(["ACTIVE", "INVITED", "SUSPENDED", "VACATION", "DEACTIVATED"]).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: "At least one field required" });

export const userIdParams = z.object({ userId: uuid }).strict();

/** Shared validators for users routes (body / params / query). */
export const usersEmptyBody = z.object({}).strict();
