/** Build idempotency keys compatible with server-side dedupe (payments, etc.). */
export function makeIdempotencyKey(parts: string[]): string {
  return parts.filter(Boolean).join(":");
}
