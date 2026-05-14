import { prisma } from "../../prisma/index.js";

export class SettingsRepository {
  getSystem(restaurantId: string) {
    return prisma.systemSettings.findUnique({
      where: { restaurantId },
    });
  }

  async upsertPatch(
    restaurantId: string,
    patch: {
      restaurantName?: string;
      address?: string | null;
      phone?: string | null;
      settingsJson?: Record<string, unknown>;
    },
  ) {
    const existing = await prisma.systemSettings.findUnique({ where: { restaurantId } });
    const mergedJson =
      patch.settingsJson !== undefined
        ? { ...((existing?.settingsJson as Record<string, unknown>) ?? {}), ...patch.settingsJson }
        : undefined;

    return prisma.systemSettings.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        restaurantName: patch.restaurantName ?? "Restaurant",
        address: patch.address ?? null,
        phone: patch.phone ?? null,
        settingsJson: (mergedJson ?? {}) as object,
      },
      update: {
        ...(patch.restaurantName !== undefined ? { restaurantName: patch.restaurantName } : {}),
        ...(patch.address !== undefined ? { address: patch.address } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(mergedJson !== undefined ? { settingsJson: mergedJson as object } : {}),
      },
    });
  }
}
