import { z } from "zod";

/** Shared validators for customers routes (body / params / query). */
export const customersEmptyBody = z.object({}).strict();
