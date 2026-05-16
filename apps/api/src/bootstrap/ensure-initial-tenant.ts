/**
 * First-run bootstrap: permissions, one restaurant, bootstrap administrator, system settings, expense categories.
 * Does not seed menu, tables, orders, or sample analytics data.
 *
 * The initial account uses `RoleCode.ADMIN` (full permission matrix). Product / UI may refer to this as
 * SUPER_ADMIN; there is no separate `SUPER_ADMIN` enum value.
 */
import type { Logger } from "pino";
import type { Prisma, RoleCode } from "@prisma/client";
import { ExpenseCategoryCode } from "@prisma/client";

import { defaultSystemSettingsJson } from "@pos/database";

import type { Env } from "../config/env.js";
import { prisma } from "../prisma/index.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

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

const ROLE_MATRIX: Record<RoleCode, string[]> = {
  ADMIN: PERMISSIONS.map((p) => p.code),
  MANAGER: [
    "menu:read",
    "menu:manage",
    "orders:create",
    "orders:read",
    "orders:update",
    "orders:delete",
    "payments:process",
    "payments:refund",
    "printing:use",
    "users:read",
    "analytics:access",
    "settings:read",
    "settings:manage",
    "tables:manage",
    "shifts:read",
    "shifts:open",
    "shifts:close",
    "expenses:manage",
  ],
  CASHIER: [
    "menu:read",
    "orders:create",
    "orders:read",
    "orders:update",
    "payments:process",
    "printing:use",
    "users:read",
    "tables:manage",
    "shifts:read",
    "shifts:open",
    "shifts:close",
    "settings:read",
  ],
  WAITER: [
    "menu:read",
    "orders:create",
    "orders:read",
    "orders:update",
    "printing:use",
    "users:read",
    "tables:manage",
    "shifts:read",
    "settings:read",
  ],
};

async function ensurePermissions(): Promise<void> {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, description: p.description },
      update: { description: p.description },
    });
  }
}

async function seedExpenseCategories(restaurantId: string): Promise<void> {
  const defs: { code: ExpenseCategoryCode; name: string; sortOrder: number }[] = [
    { code: "INGREDIENTS", name: "Ingrédients", sortOrder: 0 },
    { code: "MAINTENANCE", name: "Maintenance", sortOrder: 1 },
    { code: "CLEANING", name: "Nettoyage", sortOrder: 2 },
    { code: "UTILITIES", name: "Charges", sortOrder: 3 },
    { code: "DELIVERY", name: "Livraison", sortOrder: 4 },
    { code: "SALARIES", name: "Salaires", sortOrder: 5 },
    { code: "OTHER", name: "Autres", sortOrder: 6 },
  ];
  for (const d of defs) {
    await prisma.expenseCategory.upsert({
      where: { restaurantId_code: { restaurantId, code: d.code } },
      create: { restaurantId, code: d.code, name: d.name, sortOrder: d.sortOrder },
      update: { name: d.name, sortOrder: d.sortOrder },
    });
  }
}

async function ensureRolesForRestaurant(restaurantId: string): Promise<Record<RoleCode, string>> {
  const permRecords = await prisma.permission.findMany();
  const permByCode = new Map(permRecords.map((x) => [x.code, x.id]));
  const roleIds: Partial<Record<RoleCode, string>> = {};

  for (const code of Object.keys(ROLE_MATRIX) as RoleCode[]) {
    const role = await prisma.role.upsert({
      where: { restaurantId_code: { restaurantId, code } },
      create: {
        restaurantId,
        code,
        name: code[0]! + code.slice(1).toLowerCase(),
        description: `System role ${code}`,
        isSystem: true,
      },
      update: {},
    });
    roleIds[code] = role.id;

    const wanted = new Set(ROLE_MATRIX[code]);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const data: Prisma.RolePermissionCreateManyInput[] = [];
    for (const c of wanted) {
      const pid = permByCode.get(c);
      if (pid) data.push({ roleId: role.id, permissionId: pid });
    }
    if (data.length) {
      await prisma.rolePermission.createMany({ data });
    }
  }

  return roleIds as Record<RoleCode, string>;
}

function bootstrapAdminUsername(): string {
  return process.env.POS_INITIAL_ADMIN_USERNAME?.trim() || "admin";
}

function bootstrapAdminPasswordPlain(): string {
  return process.env.POS_INITIAL_ADMIN_PASSWORD?.trim() || "admin";
}

async function createInitialRestaurant(env: Env, log: Logger): Promise<string> {
  const slug = process.env.POS_INITIAL_RESTAURANT_SLUG?.trim() || "default";
  const name = process.env.POS_INITIAL_RESTAURANT_NAME?.trim() || "Default";

  const restaurant = await prisma.restaurant.create({
    data: {
      name,
      slug,
      timezone: "Africa/Algiers",
      currencyCode: "DZD",
    },
  });

  const roleIds = await ensureRolesForRestaurant(restaurant.id);

  const adminPassword = await hashPassword(bootstrapAdminPasswordPlain(), env);
  const adminUser = await prisma.user.create({
    data: {
      restaurantId: restaurant.id,
      fullName: "Administrator",
      username: bootstrapAdminUsername(),
      email: null,
      hashedPassword: adminPassword,
      pinHash: null,
      status: "ACTIVE",
    },
  });

  await prisma.userRole.create({
    data: { userId: adminUser.id, roleId: roleIds.ADMIN },
  });

  await prisma.systemSettings.create({
    data: {
      restaurantId: restaurant.id,
      restaurantName: name,
      address: "",
      phone: "",
      settingsJson: { ...defaultSystemSettingsJson } as Prisma.InputJsonValue,
    },
  });

  await seedExpenseCategories(restaurant.id);

  log.info({ restaurantId: restaurant.id, slug }, "Initial restaurant tenant created");
  return restaurant.id;
}

async function resolveRestaurantId(): Promise<string | null> {
  const preferred = process.env.POS_INITIAL_RESTAURANT_SLUG?.trim() || "default";
  const bySlug = await prisma.restaurant.findFirst({
    where: { slug: preferred, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (bySlug) return bySlug.id;
  const first = await prisma.restaurant.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return first?.id ?? null;
}

/**
 * When a restaurant row exists but all users were removed (e.g. data cleanup), recreate only the bootstrap admin.
 * Does not create menu, tables, or orders.
 */
async function ensureBootstrapAdminForOrphanRestaurant(env: Env, log: Logger): Promise<boolean> {
  const restaurantId = await resolveRestaurantId();
  if (!restaurantId) {
    log.warn("Users table is empty but no active restaurant found; cannot create bootstrap admin");
    return false;
  }

  const username = bootstrapAdminUsername();
  const existing = await prisma.user.findFirst({
    where: {
      restaurantId,
      username: { equals: username, mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) {
    log.info({ restaurantId }, "Bootstrap admin user already exists for restaurant");
    return false;
  }

  const roleIds = await ensureRolesForRestaurant(restaurantId);
  await seedExpenseCategories(restaurantId);

  const restaurant = await prisma.restaurant.findFirst({
    where: { id: restaurantId, deletedAt: null },
  });
  if (!restaurant) return false;

  const settings = await prisma.systemSettings.findUnique({ where: { restaurantId } });
  if (!settings) {
    await prisma.systemSettings.create({
      data: {
        restaurantId,
        restaurantName: restaurant.name,
        address: "",
        phone: "",
        settingsJson: { ...defaultSystemSettingsJson } as Prisma.InputJsonValue,
      },
    });
  }

  const hashedPassword = await hashPassword(bootstrapAdminPasswordPlain(), env);
  const adminUser = await prisma.user.create({
    data: {
      restaurantId,
      fullName: "Administrator",
      username,
      email: null,
      hashedPassword,
      pinHash: null,
      status: "ACTIVE",
    },
  });

  await prisma.userRole.create({
    data: { userId: adminUser.id, roleId: roleIds.ADMIN },
  });

  log.info(
    { restaurantId, slug: restaurant.slug, username, role: "ADMIN" },
    "Bootstrap administrator created (users table was empty; restaurant already existed)",
  );
  return true;
}

/**
 * Ensures the canonical POS tenant (`default` slug) exists with a bootstrap `admin` user whose password
 * verifies with `verifyPassword` (same path as POST /auth/login). Repairs broken hashes when needed.
 */
async function synchronizeDefaultRestaurantBootstrapAdmin(env: Env, log: Logger): Promise<{ createdAdmin: boolean }> {
  const slug = process.env.POS_INITIAL_RESTAURANT_SLUG?.trim() || "default";
  const name = process.env.POS_INITIAL_RESTAURANT_NAME?.trim() || "Default";
  const username = bootstrapAdminUsername();
  const plain = bootstrapAdminPasswordPlain();

  let restaurant = await prisma.restaurant.findFirst({
    where: { slug, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  let createdAdmin = false;

  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        name,
        slug,
        timezone: "Africa/Algiers",
        currencyCode: "DZD",
      },
    });
    const roleIds = await ensureRolesForRestaurant(restaurant.id);
    const hashedPassword = await hashPassword(plain, env);
    const adminUser = await prisma.user.create({
      data: {
        restaurantId: restaurant.id,
        fullName: "Administrator",
        username,
        email: null,
        hashedPassword,
        pinHash: null,
        status: "ACTIVE",
      },
    });
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: roleIds.ADMIN },
    });
    await prisma.systemSettings.create({
      data: {
        restaurantId: restaurant.id,
        restaurantName: name,
        address: "",
        phone: "",
        settingsJson: { ...defaultSystemSettingsJson } as Prisma.InputJsonValue,
      },
    });
    await seedExpenseCategories(restaurant.id);
    createdAdmin = true;
    log.info({ restaurantId: restaurant.id, slug }, "Canonical restaurant created with bootstrap admin");
  } else {
    await ensureRolesForRestaurant(restaurant.id);
    await seedExpenseCategories(restaurant.id);

    let user = await prisma.user.findFirst({
      where: {
        restaurantId: restaurant.id,
        username: { equals: username, mode: "insensitive" },
        deletedAt: null,
      },
    });

    if (!user) {
      const roleIds = await ensureRolesForRestaurant(restaurant.id);
      const hashedPassword = await hashPassword(plain, env);
      user = await prisma.user.create({
        data: {
          restaurantId: restaurant.id,
          fullName: "Administrator",
          username,
          email: null,
          hashedPassword,
          pinHash: null,
          status: "ACTIVE",
        },
      });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleIds.ADMIN },
      });
      createdAdmin = true;
      log.info({ restaurantId: restaurant.id, slug, username }, "Bootstrap admin created for canonical restaurant");
    } else {
      let ok = await verifyPassword(plain, user.hashedPassword);
      if (!ok) {
        const newHash = await hashPassword(plain, env);
        await prisma.user.update({
          where: { id: user.id },
          data: { hashedPassword: newHash },
        });
        ok = await verifyPassword(plain, newHash);
        if (!ok) {
          throw new Error(
            `[BOOT] Bootstrap admin password verification failed after re-hash (slug=${slug} username=${username})`,
          );
        }
        log.warn({ userId: user.id, restaurantId: restaurant.id }, "Bootstrap admin password hash repaired");
      }
    }
  }

  const verifyRow = await prisma.user.findFirst({
    where: {
      restaurantId: restaurant.id,
      username: { equals: username, mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true, hashedPassword: true },
  });
  if (!verifyRow) {
    throw new Error(`[BOOT] Bootstrap admin missing after sync (slug=${slug} username=${username})`);
  }
  const verified = await verifyPassword(plain, verifyRow.hashedPassword);
  if (!verified) {
    throw new Error(
      `[BOOT] Bootstrap admin password does not verify against stored hash (slug=${slug} username=${username})`,
    );
  }

  return { createdAdmin };
}

/** Idempotent bootstrap for empty databases (HTTP server + desktop runtime). */
export async function ensureInitialTenantIfEmpty(
  env: Env,
  log: Logger,
): Promise<{ adminStatus: "created" | "exists" }> {
  await ensurePermissions();

  let adminStatus: "created" | "exists" = "exists";

  const activeUsers = await prisma.user.count({ where: { deletedAt: null } });
  if (activeUsers > 0) {
    const restaurantId = await resolveRestaurantId();
    if (restaurantId) {
      await ensureRolesForRestaurant(restaurantId);
      await seedExpenseCategories(restaurantId);
    }
  } else {
    const restaurantCount = await prisma.restaurant.count({ where: { deletedAt: null } });
    if (restaurantCount === 0) {
      await createInitialRestaurant(env, log);
      adminStatus = "created";
    } else {
      const created = await ensureBootstrapAdminForOrphanRestaurant(env, log);
      if (created) adminStatus = "created";
    }
  }

  const { createdAdmin } = await synchronizeDefaultRestaurantBootstrapAdmin(env, log);
  if (createdAdmin) adminStatus = "created";

  return { adminStatus };
}

function desktopBootstrapLogger(write: (line: string) => void): Logger {
  const line = (level: string, obj: unknown, msg?: string) => {
    const detail = msg ?? (typeof obj === "string" ? obj : "");
    const meta = msg && typeof obj === "object" && obj ? ` ${JSON.stringify(obj)}` : "";
    write(`[bootstrap] ${level}${detail}${meta}`);
  };
  return {
    info: (obj: unknown, msg?: string) => line("", obj, msg),
    warn: (obj: unknown, msg?: string) => line("WARN ", obj, msg),
    error: (obj: unknown, msg?: string) => line("ERROR ", obj, msg),
    child: () => desktopBootstrapLogger(write),
  } as unknown as Logger;
}

/** Desktop runtime hook — same bootstrap, plain-text log lines. */
export async function runDesktopInitialBootstrap(
  env: Env,
  write: (line: string) => void,
): Promise<void> {
  write("[bootstrap] ensuring initial tenant (no sample menu/tables/orders)");
  await ensureInitialTenantIfEmpty(env, desktopBootstrapLogger(write));
  write("[bootstrap] initial tenant ready");
}
