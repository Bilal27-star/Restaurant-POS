import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

/** Result of inspecting a PostgreSQL PGDATA directory on disk. */
export type PgDataDirectoryState =
  | { kind: "missing" }
  | { kind: "empty" }
  | { kind: "valid_cluster"; pgVersion: string }
  | {
      kind: "corrupt";
      reason: string;
      markers: PgClusterMarkers;
      topLevelEntries: string[];
    };

export type PgClusterMarkers = {
  hasPgVersion: boolean;
  hasBaseDir: boolean;
  hasGlobalDir: boolean;
  pgVersionValue: string | null;
};

const MAX_LISTED_ENTRIES = 32;

/**
 * A directory is a valid initialized PostgreSQL cluster when initdb has created
 * PG_VERSION plus the catalog directories `base/` and `global/`.
 */
export function inspectPgDataDirectory(pgDataDir: string): PgDataDirectoryState {
  if (!existsSync(pgDataDir)) {
    return { kind: "missing" };
  }

  let stat;
  try {
    stat = statSync(pgDataDir);
  } catch (e) {
    return {
      kind: "corrupt",
      reason: `Cannot stat PGDATA: ${String(e)}`,
      markers: emptyMarkers(),
      topLevelEntries: [],
    };
  }

  if (!stat.isDirectory()) {
    return {
      kind: "corrupt",
      reason: "PGDATA path exists but is not a directory",
      markers: emptyMarkers(),
      topLevelEntries: [],
    };
  }

  let entries: string[];
  try {
    entries = readdirSync(pgDataDir);
  } catch (e) {
    return {
      kind: "corrupt",
      reason: `Cannot read PGDATA directory: ${String(e)}`,
      markers: emptyMarkers(),
      topLevelEntries: [],
    };
  }

  if (entries.length === 0) {
    return { kind: "empty" };
  }

  const markers = readClusterMarkers(pgDataDir);
  if (markers.hasPgVersion && markers.hasBaseDir && markers.hasGlobalDir) {
    return {
      kind: "valid_cluster",
      pgVersion: markers.pgVersionValue ?? "unknown",
    };
  }

  const partial =
    markers.hasPgVersion || markers.hasBaseDir || markers.hasGlobalDir;
  const reason = partial
    ? "PGDATA contains partial cluster files (initdb was interrupted or directory was polluted)"
    : "PGDATA is not empty but does not contain a valid PostgreSQL cluster (missing PG_VERSION, base/, global/)";

  return {
    kind: "corrupt",
    reason,
    markers,
    topLevelEntries: entries.slice(0, MAX_LISTED_ENTRIES),
  };
}

function emptyMarkers(): PgClusterMarkers {
  return {
    hasPgVersion: false,
    hasBaseDir: false,
    hasGlobalDir: false,
    pgVersionValue: null,
  };
}

function readClusterMarkers(pgDataDir: string): PgClusterMarkers {
  const pgVersionPath = path.join(pgDataDir, "PG_VERSION");
  const basePath = path.join(pgDataDir, "base");
  const globalPath = path.join(pgDataDir, "global");

  const hasPgVersion = existsSync(pgVersionPath) && statSync(pgVersionPath).isFile();
  const hasBaseDir = existsSync(basePath) && statSync(basePath).isDirectory();
  const hasGlobalDir = existsSync(globalPath) && statSync(globalPath).isDirectory();

  let pgVersionValue: string | null = null;
  if (hasPgVersion) {
    try {
      pgVersionValue = readFileSync(pgVersionPath, "utf8").trim() || null;
    } catch {
      pgVersionValue = null;
    }
  }

  return { hasPgVersion, hasBaseDir, hasGlobalDir, pgVersionValue };
}

/** Ensure PGDATA exists as an empty directory (never deletes existing data). */
export function ensurePgDataDirectoryExists(pgDataDir: string): void {
  mkdirSync(pgDataDir, { recursive: true });
}

/**
 * Remove a stale `postmaster.pid` left after crash or force-quit so `postgres -D` can start.
 * Does not remove the file when the PID is still alive.
 */
export function removeStalePostmasterPidIfNeeded(
  pgDataDir: string,
  log: (msg: string) => void,
): void {
  const pidFile = path.join(pgDataDir, "postmaster.pid");
  if (!existsSync(pidFile)) return;

  let firstLine = "";
  try {
    firstLine = readFileSync(pidFile, "utf8").split(/\r?\n/)[0]?.trim() ?? "";
  } catch (e) {
    log(`postgres: removing unreadable postmaster.pid (${String(e)})`);
    try {
      unlinkSync(pidFile);
    } catch {
      /* ignore */
    }
    return;
  }

  const pid = Number.parseInt(firstLine, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    log("postgres: removing postmaster.pid with invalid PID line");
    try {
      unlinkSync(pidFile);
    } catch {
      /* ignore */
    }
    return;
  }

  if (isProcessAlive(pid)) {
    log(`postgres: postmaster.pid references running pid=${pid}; not removing`);
    return;
  }

  log(`postgres: removing stale postmaster.pid (pid=${pid} is not running)`);
  try {
    unlinkSync(pidFile);
  } catch (e) {
    log(`postgres: failed to remove stale postmaster.pid: ${String(e)}`);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EPERM") return true;
    return false;
  }
}

export class CorruptPgDataDirectoryError extends Error {
  readonly pgDataDir: string;
  readonly state: Extract<PgDataDirectoryState, { kind: "corrupt" }>;

  constructor(pgDataDir: string, state: Extract<PgDataDirectoryState, { kind: "corrupt" }>) {
    const detail = JSON.stringify(
      {
        reason: state.reason,
        markers: state.markers,
        topLevelEntries: state.topLevelEntries,
      },
      null,
      2,
    );
    super(
      `Embedded PostgreSQL data directory is unusable.\n` +
        `PGDATA=${pgDataDir}\n` +
        `${state.reason}\n` +
        `Diagnostics:\n${detail}\n` +
        `Recovery: quit the app, back up and remove the postgres folder under app data, then relaunch to create a fresh database. ` +
        `Do not delete app data while another POS instance may be running.`,
    );
    this.name = "CorruptPgDataDirectoryError";
    this.pgDataDir = pgDataDir;
    this.state = state;
  }
}

const BOOT_LOCK_NAME = ".pos-postgres-boot.lock";
const BOOT_LOCK_MAX_AGE_MS = 2 * 60 * 1000;

/**
 * Prevents two desktop runtime processes from running initdb concurrently on the same PGDATA.
 * Retries once if the lock holder process is gone; never loops.
 */
export function acquirePostgresBootLock(appDataDir: string, log: (msg: string) => void): () => void {
  const lockPath = path.join(appDataDir, BOOT_LOCK_NAME);
  const writeLock = () => {
    writeFileSync(lockPath, `${process.pid}\n${Date.now()}\n`, { encoding: "utf8", flag: "wx" });
  };

  try {
    writeLock();
  } catch {
    if (!existsSync(lockPath)) {
      throw new Error(`Failed to create postgres boot lock at ${lockPath}`);
    }
    let holderPid = Number.NaN;
    let lockAge = Number.POSITIVE_INFINITY;
    try {
      const [pidLine, tsLine] = readFileSync(lockPath, "utf8").split(/\r?\n/);
      holderPid = Number.parseInt(pidLine ?? "", 10);
      lockAge = Date.now() - Number.parseInt(tsLine ?? "", 10);
    } catch {
      /* ignore */
    }

    const holderAlive = Number.isFinite(holderPid) && holderPid > 0 && isProcessAlive(holderPid);
    const lockStale = !holderAlive || lockAge > BOOT_LOCK_MAX_AGE_MS;

    if (!lockStale) {
      throw new Error(
        `Another POS database startup is in progress (lock held by pid=${holderPid}). ` +
          `If no other instance is running, wait a minute and try again.`,
      );
    }

    log(
      `postgres: removing stale boot lock (holderPid=${holderPid} alive=${holderAlive} ageMs=${lockAge})`,
    );
    try {
      rmSync(lockPath, { force: true });
    } catch {
      /* ignore */
    }
    writeLock();
  }

  return () => {
    try {
      rmSync(lockPath, { force: true });
    } catch {
      /* ignore */
    }
  };
}
