import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

import type { RuntimeLogFn } from "./desktop-runtime-log.js";
import {
  acquirePostgresBootLock,
  CorruptPgDataDirectoryError,
  ensurePgDataDirectoryExists,
  inspectPgDataDirectory,
  removeStalePostmasterPidIfNeeded,
  type PgDataDirectoryState,
} from "./pg-data-directory.js";

export type EmbeddedPostgresConfig = {
  appDataDir: string;
  pgDataDir: string;
  port: number;
  user: string;
  password: string;
  bundleRoot: string;
};

export type EmbeddedPostgresBinaryPaths = {
  postgres: string;
  initdb: string;
};

/** Either we started embedded-postgres, or we attach to an already-running cluster on our port. */
export type ManagedPostgres =
  | { mode: "owned"; instance: EmbeddedPostgres }
  | { mode: "external" };

const PG_TCP_READY_TIMEOUT_MS = 90_000;
const PG_START_LOG_TIMEOUT_MS = 120_000;
const PG_ATTACH_PROBE_MS = 3_000;

export async function resolveEmbeddedPostgresBinaryPaths(
  bundleRoot: string,
): Promise<EmbeddedPostgresBinaryPaths> {
  const require = createRequire(path.join(bundleRoot, "package.json"));
  /** `exports` points at `dist/index.js`; binaries live in the same `dist/` directory. */
  const distDir = path.dirname(require.resolve("embedded-postgres"));
  const binaryModule = path.join(distDir, "binary.js");
  const getBinaries = (await import(pathToFileURL(binaryModule).href)).default as () => Promise<
    EmbeddedPostgresBinaryPaths
  >;
  return getBinaries();
}

export async function waitForPostgresTcpAccept(port: number, timeoutMs: number, log: RuntimeLogFn): Promise<void> {
  const net = await import("node:net");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host: "127.0.0.1", port, timeout: 2000 }, () => {
          socket.end();
          resolve();
        });
        socket.once("error", reject);
      });
      log(`postgres: tcp_accept_ok host=127.0.0.1 port=${port}`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(
    `Timeout: PostgreSQL did not accept TCP on 127.0.0.1:${port} within ${timeoutMs}ms`,
  );
}

async function isPostgresTcpOpen(port: number, timeoutMs: number): Promise<boolean> {
  try {
    await waitForPostgresTcpAccept(port, timeoutMs, () => undefined);
    return true;
  } catch {
    return false;
  }
}

function logPgDataInspection(log: RuntimeLogFn, pgDataDir: string, state: PgDataDirectoryState): void {
  switch (state.kind) {
    case "missing":
      log(`postgres: PGDATA missing (will create) path=${pgDataDir}`);
      break;
    case "empty":
      log(`postgres: PGDATA empty path=${pgDataDir}`);
      break;
    case "valid_cluster":
      log(`postgres: PGDATA valid_cluster PG_VERSION=${state.pgVersion} path=${pgDataDir}`);
      break;
    case "corrupt":
      log(
        `postgres: PGDATA corrupt reason=${state.reason} markers=${JSON.stringify(state.markers)} entries=${state.topLevelEntries.join(",")}`,
      );
      break;
    default:
      break;
  }
}

/**
 * Production embedded PostgreSQL lifecycle:
 * - reuse an existing cluster when our port is already accepting connections
 * - inspect PGDATA (PG_VERSION, base/, global/)
 * - run initdb only when PGDATA is missing or empty
 * - start postgres, wait for TCP readiness
 */
export async function bootEmbeddedPostgres(
  config: EmbeddedPostgresConfig,
  log: RuntimeLogFn,
): Promise<ManagedPostgres> {
  const { appDataDir, pgDataDir, port, user, password, bundleRoot } = config;

  log(`postgres: phase=resolve_paths appData=${appDataDir} pgData=${pgDataDir} port=${port}`);

  mkdirSync(appDataDir, { recursive: true });

  try {
    const binaries = await resolveEmbeddedPostgresBinaryPaths(bundleRoot);
    log(`postgres: binaries postgres=${binaries.postgres} initdb=${binaries.initdb}`);
  } catch (e) {
    log(`postgres: could not resolve embedded binary paths: ${String(e)}`);
  }

  const releaseLock = acquirePostgresBootLock(appDataDir, log);

  try {
    ensurePgDataDirectoryExists(pgDataDir);

    let state = inspectPgDataDirectory(pgDataDir);
    if (state.kind === "missing") {
      ensurePgDataDirectoryExists(pgDataDir);
      state = inspectPgDataDirectory(pgDataDir);
    }
    logPgDataInspection(log, pgDataDir, state);

    if (state.kind === "corrupt") {
      throw new CorruptPgDataDirectoryError(pgDataDir, state);
    }

    if (state.kind === "valid_cluster") {
      removeStalePostmasterPidIfNeeded(pgDataDir, log);
      if (await isPostgresTcpOpen(port, PG_ATTACH_PROBE_MS)) {
        log(`postgres: phase=attach SKIP start (127.0.0.1:${port} already accepting connections)`);
        return { mode: "external" };
      }
    }

    const pg = new EmbeddedPostgres({
      databaseDir: pgDataDir,
      user,
      password,
      port,
      persistent: true,
      initdbFlags: ["--encoding=UTF8"],
      onLog: (msg) => log(`[embedded-pg] ${String(msg).trimEnd()}`),
      onError: (msg) => log(`[embedded-pg][err] ${String(msg).trimEnd()}`),
    });

    const shouldRunInitdb = state.kind === "empty" || state.kind === "missing";
    if (shouldRunInitdb) {
      log(`postgres: phase=initdb pgdata=${pgDataDir}`);
      await pg.initialise();
      const afterInit = inspectPgDataDirectory(pgDataDir);
      logPgDataInspection(log, pgDataDir, afterInit);
      if (afterInit.kind !== "valid_cluster") {
        throw new Error(
          `initdb finished but PGDATA is not a valid cluster (state=${afterInit.kind}). See backend.log.`,
        );
      }
      log("postgres: phase=initdb_ok");
    } else if (state.kind === "valid_cluster") {
      log(
        `postgres: phase=initdb SKIP (cluster already initialized) PG_VERSION=${state.pgVersion} pgdata=${pgDataDir}`,
      );
      removeStalePostmasterPidIfNeeded(pgDataDir, log);
    } else {
      throw new Error(`Unexpected PGDATA state after inspection: ${state.kind}`);
    }

    log(`postgres: phase=start pgdata=${pgDataDir} port=${port}`);
    try {
      await startPostgresWithTimeout(pg, log, PG_START_LOG_TIMEOUT_MS);
    } catch (e) {
      if (await isPostgresTcpOpen(port, PG_ATTACH_PROBE_MS)) {
        log(`postgres: phase=attach after start error (127.0.0.1:${port} is up)`);
        await pg.stop().catch(() => undefined);
        return { mode: "external" };
      }
      throw e;
    }
    await waitForPostgresTcpAccept(port, PG_TCP_READY_TIMEOUT_MS, log);
    log(`postgres: phase=ready port=${port}`);
    return { mode: "owned", instance: pg };
  } finally {
    releaseLock();
  }
}

async function startPostgresWithTimeout(
  pg: EmbeddedPostgres,
  log: RuntimeLogFn,
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pg.start(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`postgres start() did not become ready within ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    log(`postgres: start failed: ${detail || "(no message)"}`);
    await pg.stop().catch(() => undefined);
    throw e instanceof Error ? e : new Error(detail || "postgres start failed");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function stopManagedPostgres(pg: ManagedPostgres, log: RuntimeLogFn): Promise<void> {
  if (pg.mode === "external") {
    log("postgres: phase=stop skipped (external cluster — left running for fast restart)");
    return;
  }
  log("postgres: phase=stop");
  await pg.instance.stop().catch((e) => {
    log(`postgres: stop error (ignored): ${String(e)}`);
  });
}
