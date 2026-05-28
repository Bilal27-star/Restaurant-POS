import "./config/load-dotenv-init.js";

import { startDevEmbeddedPostgresIfEnabled, stopDevEmbeddedPostgresIfAny } from "./bootstrap/embedded-postgres-dev-boot.js";
import { configureDesktopApiProcessEnv } from "./config/desktop-runtime.js";
import { loadEnv } from "./config/env.js";
import { startPosHttpServer } from "./http-server.js";

const nodeEnv = process.env.NODE_ENV?.trim() || "development";

/** Self-contained dev API: bundled PostgreSQL on 127.0.0.1:55432 */
if (nodeEnv === "development" && process.env.POS_EMBEDDED_POSTGRES === undefined) {
  process.env.POS_EMBEDDED_POSTGRES = "1";
}

async function bootstrap(): Promise<void> {
  try {
    configureDesktopApiProcessEnv();

    console.log("[POS] Starting embedded postgres...");
    await startDevEmbeddedPostgresIfEnabled();

    console.log("[POS] Loading environment...");
    const env = loadEnv();

    console.log("[POS] Starting HTTP server...");
    const { gracefulShutdown } = await startPosHttpServer(env);

    async function shutdownAll(signal: string): Promise<void> {
      console.log(`[POS] Shutting down (${signal})`);
      await gracefulShutdown(signal);
      await stopDevEmbeddedPostgresIfAny();
    }

    process.on("SIGINT", () => void shutdownAll("SIGINT").then(() => process.exit(0)));
    process.on("SIGTERM", () => void shutdownAll("SIGTERM").then(() => process.exit(0)));
  } catch (error) {
    console.error("[POS] Startup failed:", error);

    try {
      await stopDevEmbeddedPostgresIfAny();
    } catch {}

    process.exit(1);
  }
}

await bootstrap();
