import { PrismaClient } from "@prisma/client";

let prismaInstance: PrismaClient | null = null;

function createClient(): PrismaClient {
  return new PrismaClient();
}

/** Lazy singleton — first use happens after `DATABASE_URL` is set (desktop embedded Postgres). */
export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = createClient();
  }
  return prismaInstance;
}

/** Call after changing `DATABASE_URL` so the next query uses the new database. */
export async function resetPrismaClient(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
