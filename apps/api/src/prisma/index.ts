import { prisma as databaseClient } from "@pos/database";

export const prisma = databaseClient;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
