import { z } from "zod";

/** Shared validators for roles routes (body / params / query). */
export const rolesEmptyBody = z.object({}).strict();
