export type OfflineLogLevel = "debug" | "info" | "warn" | "error";

export type OfflineLogContext = Record<string, unknown>;

export interface OfflineLogSink {
  log(level: OfflineLogLevel, message: string, context?: OfflineLogContext): void;
}

export function createConsoleOfflineLogSink(prefix = "[offline]"): OfflineLogSink {
  const g = globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } };
  const isProd = g.process?.env?.NODE_ENV === "production";
  return {
    log(level, message, context) {
      if (isProd && (level === "debug" || level === "info")) {
        return;
      }
      const line = `${prefix} ${message}`;
      if (level === "debug") {
        console.debug(line, context ?? "");
      } else if (level === "info") {
        console.info(line, context ?? "");
      } else if (level === "warn") {
        console.warn(line, context ?? "");
      } else {
        console.error(line, context ?? "");
      }
    },
  };
}
