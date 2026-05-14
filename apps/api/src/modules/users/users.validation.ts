import { z } from "zod";

/** Shared validators for users routes (body / params / query). */
export const usersEmptyBody = z.object({}).strict();
