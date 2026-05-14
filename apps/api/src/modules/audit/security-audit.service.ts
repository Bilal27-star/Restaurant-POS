import type { Request } from "express";
import type { Prisma } from "@prisma/client";

import { prisma } from "../../prisma/index.js";

export type SecurityAuditInput = {
  restaurantId: string;
  actorUserId: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadataJson?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Non-blocking append to `security_audit_logs`. Never throw to callers.
 */
export function appendSecurityAudit(input: SecurityAuditInput): void {
  void prisma.securityAuditLog
    .create({
      data: {
        restaurantId: input.restaurantId,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        metadataJson: input.metadataJson ?? undefined,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
    .catch(() => {
      /* avoid impacting request lifecycle */
    });
}

export function auditFromRequest(
  req: Request,
  input: Omit<SecurityAuditInput, "restaurantId" | "actorUserId" | "ipAddress" | "userAgent"> & {
    restaurantId?: string;
    actorUserId?: string | null;
  },
): void {
  const restaurantId = input.restaurantId ?? req.auth?.restaurantId;
  const actorUserId = input.actorUserId ?? req.auth?.userId ?? null;
  if (!restaurantId) return;
  appendSecurityAudit({
    restaurantId,
    actorUserId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadataJson: input.metadataJson ?? undefined,
    ipAddress: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
}
