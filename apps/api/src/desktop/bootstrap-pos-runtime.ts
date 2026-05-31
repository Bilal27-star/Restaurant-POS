/**
 * Desktop POS embedded runtime: local PostgreSQL, Prisma migrations, Express API.
 * Spawned by the Tauri shell with `POS_BUNDLE_ROOT`, `POS_APP_DATA_DIR`, `POS_ENV_FILE`.
 *
 * Boot order: database → migrations → load env → admin + HTTP (see `startPosHttpServer`) → /health.
 * Uses bundled `embedded-postgres` on 127.0.0.1 — never Docker `localhost:5432`.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { loadApiDotenv } from "../config/load-dotenv.js";
import { createDesktopRuntimeLogger } from "./desktop-runtime-log.js";
import {
  bootEmbeddedPostgres,
  stopManagedPostgres,
  type ManagedPostgres,
} from "./embedded-postgres-lifecycle.js";
import { CorruptPgDataDirectoryError } from "./pg-data-directory.js";
import { runPrismaMigrateDeployWithRetry } from "../bootstrap/run-prisma-migrate.js";
import { configureDesktopApiProcessEnv } from "../config/desktop-runtime.js";
import { loadEnv } from "../config/env.js";

const { log, logFatal } = createDesktopRuntimeLogger();

process.on("uncaughtException", (err) => {
  logFatal("uncaughtException", err);
  console.error(err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logFatal("unhandledRejection", reason);
  console.error(reason);
  process.exit(1);
});

function loadRuntimeEnvFiles() {
  const envFile = process.env.POS_ENV_FILE;
  if (envFile) {
    dotenv.config({ path: envFile });
  }
  loadApiDotenv();
}

function resolveBundleRoot(): string {
  if (process.env.POS_BUNDLE_ROOT) {
    return path.resolve(process.env.POS_BUNDLE_ROOT);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  if (path.basename(here) === "desktop") {
    return path.resolve(here, "..", "..");
  }
  return path.resolve(here, "..");
}

function isolateBundledPrismaEnv() {
  for (const k of [
    "PRISMA_QUERY_ENGINE_LIBRARY",
    "PRISMA_SCHEMA_ENGINE_BINARY",
    "PRISMA_MIGRATION_ENGINE_BINARY",
    "PRISMA_INTROSPECTION_ENGINE_BINARY",
  ]) {
    if (process.env[k] !== undefined) delete process.env[k];
  }
  process.env.PRISMA_CLIENT_ENGINE_TYPE = "binary";
}

async function waitForLocalHttpHealth(httpPort: number, timeoutMs: number): Promise<void> {
  const http = await import("node:http");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(
        { hostname: "127.0.0.1", port: httpPort, path: "/health", timeout: 2500 },
        (res) => {
          res.resume();
          resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) {
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout: GET http://127.0.0.1:${httpPort}/health did not return 2xx within ${timeoutMs}ms`);
}

async function main() {
  loadRuntimeEnvFiles();
  process.env.NODE_ENV = "production";
  process.env.POS_DESKTOP_RUNTIME = "1";
  /** Desktop LAN server: bind all interfaces (ignore stale packaged `.env` / old bundled dist defaults). */
  process.env.LISTEN_HOST = "0.0.0.0";
  /** Ignore any packaged `.env` pointing at Docker — desktop uses embedded PG only. */
  delete process.env.DATABASE_URL;
  configureDesktopApiProcessEnv(process.env);

  const bundleRoot = resolveBundleRoot();
  isolateBundledPrismaEnv();

  const appDataDir = path.resolve(
    process.env.POS_APP_DATA_DIR ?? path.join(bundleRoot, "..", ".pos-desktop-data"),
  );
  const pgDataDir = path.resolve(
    process.env.POS_EMBEDDED_PG_DATADIR ?? path.join(appDataDir, "postgres"),
  );
  const port = Number(process.env.POS_EMBEDDED_PG_PORT ?? "55432");
  const user = process.env.POS_EMBEDDED_PG_USER ?? "postgres";
  const password = process.env.POS_EMBEDDED_PG_PASSWORD ?? "postgres";

  log(
    `boot: resolve_paths bundleRoot=${bundleRoot} appData=${appDataDir} pgData=${pgDataDir} execPath=${process.execPath} cwd=${process.cwd()}`,
  );

  let pg: ManagedPostgres;
  try {
    log("boot: starting postgres");
    pg = await bootEmbeddedPostgres(
      { appDataDir, pgDataDir, port, user, password, bundleRoot },
      log,
    );
    console.log("[BOOT] database ready");
  } catch (err) {
    if (err instanceof CorruptPgDataDirectoryError) {
      logFatal("postgres_corrupt_pgdata", err);
    } else {
      logFatal("postgres_boot", err);
    }
    throw err;
  }

  const databaseUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`;
  process.env.DATABASE_URL = databaseUrl;

  try {
    log("boot: prisma_migrate");
    await runPrismaMigrateDeployWithRetry(databaseUrl, bundleRoot, log);
    console.log("[BOOT] migrations completed");
  } catch (err) {
    logFatal("prisma_migrate", err);
    await stopManagedPostgres(pg, log);
    throw err;
  }

  const { resetPrismaClient } = await import("@pos/database");
  await resetPrismaClient();

  const env = loadEnv();

  log(`boot: starting HTTP on ${env.LISTEN_HOST}:${env.PORT}`);
  const { startPosHttpServer } = await import("../http-server.js");
  const { gracefulShutdown } = await startPosHttpServer(env);
  await waitForLocalHttpHealth(env.PORT, 60_000);

  let shuttingDown = false;
  async function stop(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`boot: shutdown signal=${signal}`);
    await gracefulShutdown(signal);
    await stopManagedPostgres(pg, log);
    process.exit(0);
  }
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
}

void main().catch((err) => {
  console.error("[BOOT] FAILED:", err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
