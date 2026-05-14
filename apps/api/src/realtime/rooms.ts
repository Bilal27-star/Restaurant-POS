import { PermissionCodes } from "../core/auth/permission-codes.js";

/** Logical channel → single Socket.IO room per tenant (avoids duplicate delivery). */
export const RealtimeRooms = {
  /** Floor + orders + payments + printing: operational POS surfaces. */
  STAFF: "staff",
  ANALYTICS: "analytics",
  SHIFTS: "shifts",
  ADMIN: "admin",
} as const;

export type RealtimeRoomKey = (typeof RealtimeRooms)[keyof typeof RealtimeRooms];

export function tenantRoom(restaurantId: string, key: RealtimeRoomKey): string {
  return `rt:${restaurantId}:${key}`;
}

export function staffMayJoin(permissions: ReadonlySet<string>): boolean {
  return (
    permissions.has(PermissionCodes.ORDERS_READ) ||
    permissions.has(PermissionCodes.ORDERS_CREATE) ||
    permissions.has(PermissionCodes.ORDERS_UPDATE) ||
    permissions.has(PermissionCodes.ORDERS_DELETE) ||
    permissions.has(PermissionCodes.TABLES_MANAGE) ||
    permissions.has(PermissionCodes.PAYMENTS_PROCESS) ||
    permissions.has(PermissionCodes.PRINTING_USE)
  );
}

export function analyticsMayJoin(permissions: ReadonlySet<string>): boolean {
  return permissions.has(PermissionCodes.ANALYTICS_ACCESS);
}

export function shiftsMayJoin(permissions: ReadonlySet<string>): boolean {
  return (
    permissions.has(PermissionCodes.SHIFTS_READ) ||
    permissions.has(PermissionCodes.SHIFTS_OPEN) ||
    permissions.has(PermissionCodes.SHIFTS_CLOSE) ||
    permissions.has(PermissionCodes.PAYMENTS_PROCESS)
  );
}

export function adminMayJoin(permissions: ReadonlySet<string>): boolean {
  return permissions.has(PermissionCodes.SETTINGS_MANAGE);
}
