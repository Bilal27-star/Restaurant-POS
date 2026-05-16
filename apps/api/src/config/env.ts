import { z } from "zod";

import { DEFAULT_API_BASE_PATH } from "./constants.js";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required for Prisma"),
    API_BASE_PATH: z.string().default(DEFAULT_API_BASE_PATH),
    /** Comma-separated allowed browser / Tauri webview origins. Empty = reflect `Origin` (local POS + desktop shells). */
    CORS_ORIGINS: z.string().optional(),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
    JWT_ISSUER: z.string().min(1).default("pos-api"),
    JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL_SEC: z.coerce.number().int().positive().default(604800),
    PIN_PEPPER: z.string().min(32, "PIN_PEPPER must be at least 32 characters"),
    AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().min(3).max(50).default(8),
    AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    /** Set by Tauri embedded Node (`POS_DESKTOP_RUNTIME=1`) or local dev bootstrap. */
    POS_DESKTOP_RUNTIME: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((v) => v === "true" || v === "1"),
    AUTH_REFRESH_TOKEN_IN_BODY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment: ${JSON.stringify(message)}`);
  }
  return parsed.data;
}
