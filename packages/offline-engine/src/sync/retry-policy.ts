import type { OfflineLogSink } from "../logging/offline-log.js";

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 12,
  baseDelayMs: 2_000,
  maxDelayMs: 120_000,
};

export function computeBackoffMs(policy: RetryPolicy, attemptCount: number): number {
  const raw = policy.baseDelayMs * Math.pow(2, Math.max(0, attemptCount - 1));
  return Math.min(policy.maxDelayMs, raw);
}

export function shouldMarkDead(policy: RetryPolicy, attemptCount: number): boolean {
  return attemptCount >= policy.maxAttempts;
}

export function logRetryScheduled(
  log: OfflineLogSink,
  opId: string,
  attempt: number,
  delayMs: number,
  err: unknown,
): void {
  log.log("warn", "outbox retry scheduled", {
    opId,
    attempt,
    delayMs,
    error: err instanceof Error ? err.message : String(err),
  });
}
