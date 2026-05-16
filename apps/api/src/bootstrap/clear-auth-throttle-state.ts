import { isAuthThrottleDisabled } from "../config/desktop-runtime.js";
import type { Env } from "../config/env.js";
import type { RootLogger } from "../config/logger.js";
import { prisma } from "../prisma/index.js";

/**
 * Clears persisted failed-login counters so a backend restart never inherits lockout state
 * on local desktop / dev API processes (no separate throttle tables — fields live on `users`).
 */
export async function clearAuthThrottleStateIfDesktop(env: Env, logger?: RootLogger): Promise<void> {
  if (!isAuthThrottleDisabled(env)) return;

  try {
    const result = await prisma.user.updateMany({
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    logger?.info(
      { auth_throttle_disabled_desktop: true, usersLockStateCleared: result.count },
      "auth_throttle_state_cleared_on_boot",
    );
  } catch (err) {
    logger?.warn(
      { auth_throttle_disabled_desktop: true, err },
      "auth_throttle_clear_skipped_db_unavailable",
    );
  }
}
