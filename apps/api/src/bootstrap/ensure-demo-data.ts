/**
 * When the database has no restaurants (fresh install), create the canonical demo tenant
 * so the desktop app and first-time devs can log in with admin / admin without running `prisma db seed`.
 */
import bcrypt from "bcrypt";
import type { Logger } from "pino";
import type { Prisma, RoleCode } from "@prisma/client";

import { defaultSystemSettingsJson } from "@pos/database";

import type { Env } from "../config/env.js";
import { prisma } from "../prisma/index.js";

const PERMISSIONS: { code: string; description: string }[] = [
  { code: "menu:read", description: "View menu" },
  { code: "menu:manage", description: "Create and edit menu" },
  { code: "orders:create", description: "Create orders" },
  { code: "orders:read", description: "View orders and history" },
  { code: "orders:update", description: "Update orders" },
  { code: "orders:delete", description: "Delete or void orders" },
  { code: "payments:process", description: "Record payments at POS" },
  { code: "payments:refund", description: "Issue payment refunds" },
  { code: "printing:use", description: "Enqueue print jobs and access thermal payloads" },
  { code: "users:read", description: "View staff profiles" },
  { code: "users:manage", description: "Invite, edit, suspend staff" },
  { code: "roles:manage", description: "Manage roles and permissions" },
  { code: "analytics:access", description: "View analytics and reports" },
  { code: "settings:read", description: "View system and restaurant settings" },
  { code: "settings:manage", description: "Edit restaurant and system settings" },
  { code: "tables:manage", description: "Manage floor plans and tables" },
  { code: "shifts:read", description: "View current shift state" },
  { code: "shifts:open", description: "Open cash shifts" },
  { code: "shifts:close", description: "Close cash shifts" },
  { code: "expenses:manage", description: "Record expenses" },
];

export async function ensureDemoTenantIfEmpty(env: Env, log: Logger): Promise<void> {
  const count = await prisma.restaurant.count();
  if (count > 0) {
    return;
  }

  log.warn("No restaurants in database — creating demo tenant (slug `demo`, user `admin` / `admin`).");

  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, description: p.description },
      update: { description: p.description },
    });
  }

  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Demo Restaurant",
      slug: "demo",
      timezone: "Africa/Algiers",
      currencyCode: "DZD",
    },
  });

  const permRecords = await prisma.permission.findMany();
  const permByCode = new Map(permRecords.map((x) => [x.code, x.id]));

  const adminRoleCode: RoleCode = "ADMIN";
  const role = await prisma.role.create({
    data: {
      restaurantId: restaurant.id,
      code: adminRoleCode,
      name: "Admin",
      description: "System role ADMIN",
      isSystem: true,
    },
  });

  const data: Prisma.RolePermissionCreateManyInput[] = [];
  for (const code of PERMISSIONS.map((p) => p.code)) {
    const pid = permByCode.get(code);
    if (pid) data.push({ roleId: role.id, permissionId: pid });
  }
  if (data.length) {
    await prisma.rolePermission.createMany({ data });
  }

  const adminPassword = await bcrypt.hash("admin", env.BCRYPT_ROUNDS);
  const adminUser = await prisma.user.create({
    data: {
      restaurantId: restaurant.id,
      fullName: "Administrator",
      username: "admin",
      email: "admin@demo.local",
      hashedPassword: adminPassword,
      pinHash: null,
      status: "ACTIVE",
    },
  });

  await prisma.userRole.create({
    data: { userId: adminUser.id, roleId: role.id },
  });

  await prisma.systemSettings.create({
    data: {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      address: "1 Rue de la Démo",
      phone: "+213 000 000 000",
      settingsJson: { ...defaultSystemSettingsJson } as Prisma.InputJsonValue,
    },
  });

  log.info(
    { restaurantId: restaurant.id },
    "Demo tenant ready: restaurant slug `demo`, login admin / admin. Run `pnpm --filter @pos/database db:seed` for full sample menu and tables.",
  );
}
