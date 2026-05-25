import type { Request, Response } from "express";

import { sendSuccess } from "../../core/http/response.js";
import { asyncHandler } from "../../core/http/asyncHandler.js";
import { auditFromRequest } from "../audit/security-audit.service.js";
import type { SettingsDataManagementService } from "./settings-data-management.service.js";
import type { SettingsService } from "./settings.service.js";

export class SettingsController {
  constructor(
    private readonly service: SettingsService,
    private readonly dataManagement: SettingsDataManagementService,
  ) {}

  getSystem = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.service.getSystem(rid);
    sendSuccess(res, data, { message: "OK" });
  });

  patchSystem = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const body = req.body as {
      restaurantName?: string;
      address?: string | null;
      phone?: string | null;
      settingsJson?: Record<string, unknown>;
    };
    const data = await this.service.patchSystem(rid, body);
    auditFromRequest(req, {
      action: "settings.patch",
      resourceType: "system_settings",
      resourceId: rid,
      metadataJson: { keys: Object.keys(body) },
    });
    sendSuccess(res, data, { message: "Settings updated" });
  });

  exportBackup = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.dataManagement.exportBackup(rid);
    auditFromRequest(req, {
      action: "settings.backup.export",
      resourceType: "restaurant_backup",
      resourceId: rid,
    });
    sendSuccess(res, data, { message: "Backup exported" });
  });

  restoreBackup = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.dataManagement.restoreBackup(rid, req.body);
    auditFromRequest(req, {
      action: "settings.backup.restore",
      resourceType: "restaurant_backup",
      resourceId: rid,
      metadataJson: { restored: data.restored },
    });
    sendSuccess(res, data, { message: "Backup restored" });
  });

  clearOperationalData = asyncHandler(async (req: Request, res: Response) => {
    const rid = req.auth!.restaurantId;
    const data = await this.dataManagement.clearOperationalData(rid);
    auditFromRequest(req, {
      action: "settings.data.clear",
      resourceType: "restaurant",
      resourceId: rid,
      metadataJson: { deleted: data.deleted },
    });
    sendSuccess(res, data, { message: "Operational data cleared" });
  });
}
