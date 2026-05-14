import type { OutboxOperation } from "./outbox-types.js";

/**
 * Future: merge strategies when `baseServerVersion` lags server `version` (409).
 * Callers will map API conflicts into structured decisions before re-queueing.
 */
export type ConflictResolutionStrategy = "server_wins" | "client_replay" | "manual_queue";

export type ConflictPolicyInput = {
  operation: OutboxOperation;
  httpStatus: number;
  serverMessage?: string | null;
};

export type ConflictPolicyResult =
  | { action: "drop"; reason: string }
  | { action: "retry_after_pull"; strategy: ConflictResolutionStrategy }
  | { action: "dead_letter"; reason: string };

/** Placeholder — wire real rules when `/sync/push` exists. */
export function evaluateConflictPolicy(_input: ConflictPolicyInput): ConflictPolicyResult {
  return { action: "retry_after_pull", strategy: "server_wins" };
}
