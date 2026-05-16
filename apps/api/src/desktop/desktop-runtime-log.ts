import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type RuntimeLogFn = (message: string) => void;

export function createDesktopRuntimeLogger(scope = "pos-desktop-runtime"): {
  log: RuntimeLogFn;
  logFatal: (phase: string, err: unknown) => void;
  logPath: string | null;
} {
  const logPath = resolveBackendLogPath();

  const log: RuntimeLogFn = (message) => {
    const line = `[${new Date().toISOString()}] [${scope}] ${message}`;
    if (logPath) {
      try {
        appendFileSync(logPath, `${line}\n`, { encoding: "utf8" });
      } catch {
        /* ignore */
      }
    }
    if (process.env.POS_DESKTOP_LOG_STDERR !== "0") {
      console.error(line);
    }
  };

  const logFatal = (phase: string, err: unknown) => {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    log(`[FATAL:${phase}] ${msg}`);
  };

  return { log, logFatal, logPath };
}

function resolveBackendLogPath(): string | null {
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
