import {
  clearRestaurantOperationalData,
  exportRestaurantBackup,
  restoreRestaurantBackup,
  RESTAURANT_BACKUP_VERSION,
  type RestaurantBackupPayload,
} from "@pos/database";

import { ApiError } from "../../core/http/ApiError.js";
import { getRealtimeHub } from "../../realtime/registry.js";
import { prisma } from "../../prisma/index.js";
import { restaurantBackupPayloadSchema } from "./settings.validation.js";

export class SettingsDataManagementService {
  async exportBackup(restaurantId: string) {
    return await exportRestaurantBackup(prisma, restaurantId);
  }

  async restoreBackup(restaurantId: string, raw: unknown) {
    const parsed = restaurantBackupPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid backup file structure", {
        issues: parsed.error.flatten(),
      });
    }
    if (parsed.data.version !== RESTAURANT_BACKUP_VERSION) {
      throw ApiError.badRequest(`Unsupported backup version: ${parsed.data.version}`);
    }
    try {
      const result = await restoreRestaurantBackup(prisma, restaurantId, parsed.data as RestaurantBackupPayload);
      getRealtimeHub()?.publishStaffDataChanged(restaurantId, {
        domains: ["settings", "menu", "tables", "orders", "users"],
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Restore failed";
      throw ApiError.badRequest(message);
    }
  }

  async clearOperationalData(restaurantId: string) {
    try {
      const result = await clearRestaurantOperationalData(prisma, restaurantId);
      getRealtimeHub()?.publishStaffDataChanged(restaurantId, {
        domains: ["settings", "menu", "tables", "orders", "users"],
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Clear data failed";
      throw ApiError.conflict(message);
    }
  }
}
