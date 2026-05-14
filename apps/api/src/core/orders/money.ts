import { Prisma } from "@prisma/client";

export const moneyZero = new Prisma.Decimal(0);

export function money(value: string | number | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function moneyAdd(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.add(b);
}

export function moneyMul(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.mul(b);
}

export function moneyMulInt(a: Prisma.Decimal, qty: number): Prisma.Decimal {
  return a.mul(money(qty));
}
