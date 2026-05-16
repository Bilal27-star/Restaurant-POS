import "dotenv/config";

import { startDevEmbeddedPostgresIfEnabled, stopDevEmbeddedPostgresIfAny } from "./bootstrap/embedded-postgres-dev-boot.js";
import { configureDesktopApiProcessEnv } from "./config/desktop-runtime.js";
import { loadEnv } from "./config/env.js";
import { startPosHttpServer } from "./http-server.js";

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
/** Self-contained dev API: bundled PostgreSQL on 127.0.0.1:55432 (not Docker :5432). Set `POS_EMBEDDED_POSTGRES=0` to use `DATABASE_URL` only. */
if (nodeEnv === "development" && process.env.POS_EMBEDDED_POSTGRES === undefined) {
  process.env.POS_EMBEDDED_POSTGRES = "1";
}

configureDesktopApiProcessEnv();
await startDevEmbeddedPostgresIfEnabled();

const env = loadEnv();
const { gracefulShutdown } = await startPosHttpServer(env);

async function shutdownAll(signal: string): Promise<void> {
  await gracefulShutdown(signal);
  await stopDevEmbeddedPostgresIfAny();
}

process.on("SIGINT", () => void shutdownAll("SIGINT").then(() => process.exit(0)));
process.on("SIGTERM", () => void shutdownAll("SIGTERM").then(() => process.exit(0)));
