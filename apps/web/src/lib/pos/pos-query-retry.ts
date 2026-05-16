import { ApiClientError } from "@pos/api-client";

/** Do not retry client errors or rate limits — prevents 429 retry storms on desktop POS. */
export function posQueryRetry(failureCount: number, error: unknown): boolean {
  const status = error instanceof ApiClientError ? error.status : undefined;
  if (status === 429) return false;
  if (status != null && status >= 400 && status < 500) return false;
  return failureCount < 1;
}
