import { ApiError } from "../../core/http/ApiError.js";
import { getRealtimeHub } from "../../realtime/registry.js";

import { SettingsRepository } from "./settings.repository.js";

export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  async getSystem(restaurantId: string) {
    const row = await this.repo.getSystem(restaurantId);
    if (!row) {
      throw ApiError.notFound("System settings not found");
    }
    return {
      id: row.id,
      restaurantName: row.restaurantName,
      address: row.address,
      phone: row.phone,
      settingsJson: row.settingsJson,
      updatedAt: row.updatedAt,
    };
  }

  async patchSystem(
    restaurantId: string,
    patch: { restaurantName?: string; address?: string | null; phone?: string | null; settingsJson?: Record<string, unknown> },
  ) {
    const row = await this.repo.upsertPatch(restaurantId, patch);
    getRealtimeHub()?.publishStaffDataChanged(restaurantId, { domains: ["settings"] });
    return {
      id: row.id,
      restaurantName: row.restaurantName,
      address: row.address,
      phone: row.phone,
      settingsJson: row.settingsJson,
      updatedAt: row.updatedAt,
    };
  }
}
