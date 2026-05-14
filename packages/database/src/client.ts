import { PrismaClient } from "@prisma/client";

/** Single shared Prisma client for the API process (pooled). */
export const prisma = new PrismaClient();
