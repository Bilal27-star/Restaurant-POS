import { createHmac, timingSafeEqual } from "node:crypto";

import bcrypt from "bcrypt";

import type { Env } from "../../config/env.js";

const PIN_REGEX = /^\d{4}$/;

export function assertValidPinFormat(pin: string): void {
  if (!PIN_REGEX.test(pin)) {
    throw new Error("PIN must be exactly 4 digits");
  }
}

export function pinPepperedDigest(pin: string, env: Env): string {
  assertValidPinFormat(pin);
  return createHmac("sha256", env.PIN_PEPPER).update(`pos-pin-v1|${pin}`).digest("hex");
}

export async function hashPin(pin: string, env: Env): Promise<string> {
  const digest = pinPepperedDigest(pin, env);
  return bcrypt.hash(digest, env.BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, pinHash: string | null, env: Env): Promise<boolean> {
  if (!pinHash) return false;
  try {
    assertValidPinFormat(pin);
  } catch {
    return false;
  }
  const digest = pinPepperedDigest(pin, env);
  return bcrypt.compare(digest, pinHash);
}

/** Constant-time string compare for refresh tokens before hashing. */
export function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
