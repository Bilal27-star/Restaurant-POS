import { z } from "zod";

import type { RealtimeEventName } from "./events.js";

const baseEnvelope = z
  .object({
    v: z.literal(1),
    restaurantId: z.string().uuid(),
  })
  .passthrough();

/**
 * Best-effort outbound validation to catch accidental shape drift before emission.
 * Fail-open: logs only; never blocks business transactions.
 */
export function assertRealtimePayload(
  log: { warn: (o: Record<string, unknown>, msg: string) => void },
  event: RealtimeEventName,
  payload: unknown,
): void {
  const parsed = baseEnvelope.safeParse(payload);
  if (!parsed.success) {
    log.warn({ event, issues: parsed.error.flatten() }, "realtime payload envelope invalid");
  }
}
