/**
 * Tauri production entry: embedded Postgres, Prisma migrations, then HTTP API.
 * Spawned by the desktop shell with POS_BUNDLE_ROOT, POS_APP_DATA_DIR, POS_ENV_FILE.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import EmbeddedPostgres from "embedded-postgres";

import { loadEnv } from "./config/env.js";
import { startPosHttpServer } from "./http-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function backendLogPath(): string | null {
  const base = process.env.POS_APP_DATA_DIR;
  if (!base) return null;
  const dir = path.join(base, "logs");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(dir, "backend.log");
}

function appendBackendLine(message: string) {
  const p = backendLogPath();
  if (!p) return;
  const line = `[${new Date().toISOString()}] [desktop-runtime] ${message}\n`;
  try {
    appendFileSync(p, line, { encoding: "utf8" });
  } catch {
    /* ignore */
  }
}

function loadRuntimeEnvFiles() {
  const envFile = process.env.POS_ENV_FILE;
  if (envFile) {
    dotenv.config({ path: envFile });
  }
  dotenv.config();
}

function resolveBundleRoot(): string {
  if (process.env.POS_BUNDLE_ROOT) {
    return path.resolve(process.env.POS_BUNDLE_ROOT);
  }
  return path.resolve(__dirname, "..");
}

function runPrismaMigrateDeploy(databaseUrl: string, bundleRoot: string) {
  const require = createRequire(path.join(bundleRoot, "package.json"));
  const dbPkgDir = path.dirname(require.resolve("@pos/database/package.json"));
  const prismaPkgDir = path.dirname(require.resolve("prisma/package.json", { paths: [dbPkgDir] }));
  const prismaCli = path.join(prismaPkgDir, "build", "index.js");
  const schema = path.join(dbPkgDir, "prisma", "schema.prisma");
  appendBackendLine(`prisma migrate deploy cwd=${dbPkgDir} schema=${schema}`);
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schema], {
    cwd: dbPkgDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}

async function main() {
  loadRuntimeEnvFiles();
  const bundleRoot = resolveBundleRoot();
  appendBackendLine(`bundleRoot=${bundleRoot} execPath=${process.execPath} cwd=${process.cwd()}`);
  const appData = process.env.POS_APP_DATA_DIR ?? path.join(bundleRoot, "..", ".pos-desktop-data");
  const pgDataDir = process.env.POS_EMBEDDED_PG_DATADIR ?? path.join(appData, "postgres");
  const port = Number(process.env.POS_EMBEDDED_PG_PORT ?? "55432");
  const user = process.env.POS_EMBEDDED_PG_USER ?? "postgres";
  const password = process.env.POS_EMBEDDED_PG_PASSWORD ?? "postgres";
  const pg = new EmbeddedPostgres({
    databaseDir: pgDataDir,
    user,
    password,
    port,
    persistent: true,
    onLog: (msg) => {
      appendBackendLine(`[embedded-pg] ${msg}`);
      if (process.env.NODE_ENV !== "production") {
        console.log("[embedded-pg]", msg);
      }
    },
    onError: (msg) => {
      appendBackendLine(`[embedded-pg][err] ${msg}`);
      console.error(msg);
    },
  });
  try {
    appendBackendLine(`embedded postgres init dataDir=${pgDataDir} port=${port}`);
    await pg.initialise();
    await pg.start();
    appendBackendLine(`embedded postgres listening on ${port}`);
  } catch (err) {
    const msg = `[desktop-runtime] Embedded Postgres failed to start. dataDir=${pgDataDir}`;
    appendBackendLine(`${msg} ${String(err)}`);
    console.error(msg, err);
    throw err;
  }
  const databaseUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`;
  process.env.DATABASE_URL = databaseUrl;
  try {
    runPrismaMigrateDeploy(databaseUrl, bundleRoot);
    appendBackendLine("prisma migrate deploy completed");
  } catch (err) {
    appendBackendLine(`Prisma migrate deploy failed: ${String(err)}`);
    console.error("[desktop-runtime] Prisma migrate deploy failed.", err);
    await pg.stop().catch(() => undefined);
    throw err;
  }
  const env = loadEnv();
  appendBackendLine(`starting HTTP on PORT=${env.PORT}`);
  const { gracefulShutdown } = await startPosHttpServer(env);
  appendBackendLine("HTTP server started");
  async function stop(signal: string) {
    await gracefulShutdown(signal);
    await pg.stop().catch(() => undefined);
    process.exit(0);
  }
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
