import { prisma } from "../../prisma/index.js";

const SETTINGS_KEY = "kitchenDeltaPrintingEnabled";

/**
 * Spec §16 — `settingsJson.kitchenDeltaPrintingEnabled`.
 * After Kitchen Delta Phase 2/2.5, enabled by default unless explicitly set to `false`.
 * Env: `KITCHEN_DELTA_PRINTING_ENABLED=1|0` overrides per process.
 */
export async function isKitchenDeltaPrintingEnabled(restaurantId: string): Promise<boolean> {
  const env = process.env.KITCHEN_DELTA_PRINTING_ENABLED;
  if (env === "1") {
    return true;
  }
  if (env === "0") {
    return false;
  }

  const row = await prisma.systemSettings.findUnique({
    where: { restaurantId },
    select: { settingsJson: true },
  });
  const json = row?.settingsJson;
  if (!json || typeof json !== "object") {
    return true;
  }
  const flag = (json as Record<string, unknown>)[SETTINGS_KEY];
  if (flag === false) {
    return false;
  }
  return true;
}
