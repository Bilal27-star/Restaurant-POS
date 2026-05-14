import pino from "pino";

import type { Env } from "./env.js";

export type LogDomain = "http" | "auth" | "payments" | "shifts" | "sync" | "app" | "realtime";

export function createRootLogger(env: Env) {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: "pos-api" },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.pin",
        "req.body.refreshToken",
      ],
      remove: true,
    },
  });
}

export type RootLogger = ReturnType<typeof createRootLogger>;

export function createDomainLogger(root: RootLogger, domain: LogDomain) {
  return root.child({ domain });
}
