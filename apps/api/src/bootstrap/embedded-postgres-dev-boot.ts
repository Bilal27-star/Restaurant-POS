/**
 * Development / local API: bundled `embedded-postgres` on 127.0.0.1 (not Docker :5432).
 * Enabled when `POS_EMBEDDED_POSTGRES` is true (default in development — see server.ts).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  bootEmbeddedPostgres,
  stopManagedPostgres,
  type ManagedPostgres,
} from "../desktop/embedded-postgres-lifecycle.js";
import { CorruptPgDataDirectoryError } from "../desktop/pg-data-directory.js";
import { runPrismaMigrateDeployWithRetry } from "./run-prisma-migrate.js";

function isolateBundledPrismaEnvForMigrate(): void {
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

function isEmbeddedPostgresEnabled(): boolean {
  const v = process.env.POS_EMBEDDED_POSTGRES?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveApiPackageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..");
}

let managed: ManagedPostgres | null = null;

export async function startDevEmbeddedPostgresIfEnabled(): Promise<void> {
  if (!isEmbeddedPostgresEnabled()) return;

  delete process.env.DATABASE_URL;
  isolateBundledPrismaEnvForMigrate();

  const bundleRoot = resolveApiPackageRoot();
  const appDataDir = path.resolve(bundleRoot, ".embedded-pg-dev");
  const pgDataDir = path.resolve(
    process.env.POS_EMBEDDED_PG_DATADIR ?? path.join(appDataDir, "postgres"),
  );
  const pgPort = Number(process.env.POS_EMBEDDED_PG_PORT ?? "55432");
  const user = process.env.POS_EMBEDDED_PG_USER ?? "postgres";
  const password = process.env.POS_EMBEDDED_PG_PASSWORD ?? "postgres";

  const log = (line: string) => console.log(`[embedded-pg] ${line}`);

  try {
    managed = await bootEmbeddedPostgres(
      { appDataDir, pgDataDir, port: pgPort, user, password, bundleRoot },
      log,
    );
  } catch (err) {
    if (err instanceof CorruptPgDataDirectoryError) {
      console.error("[BOOT] FAILED: embedded PostgreSQL data directory is corrupt.", err);
    } else {
      console.error("[BOOT] FAILED: could not start embedded PostgreSQL.", err);
    }
    throw err;
  }

  const databaseUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${pgPort}/postgres`;
  process.env.DATABASE_URL = databaseUrl;

  console.log("[BOOT] database ready");

  try {
    await runPrismaMigrateDeployWithRetry(databaseUrl, bundleRoot, log);
  } catch (err) {
    console.error("[BOOT] FAILED: Prisma migrations did not apply.", err);
    await stopManagedPostgres(managed, log);
    managed = null;
    throw err;
  }

  console.log("[BOOT] migrations completed");

  const { resetPrismaClient } = await import("@pos/database");
  await resetPrismaClient();
}

export async function stopDevEmbeddedPostgresIfAny(): Promise<void> {
  if (!managed) return;
  const log = (line: string) => console.log(`[embedded-pg] ${line}`);
  await stopManagedPostgres(managed, log);
  managed = null;
}
