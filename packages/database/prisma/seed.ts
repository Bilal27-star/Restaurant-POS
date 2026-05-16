import { ExpenseCategoryCode, PrismaClient, RoleCode, type Prisma } from "@prisma/client";
import bcrypt from "bcrypt";

import { defaultSystemSettingsJson } from "../src/default-settings.js";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

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

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, description: p.description },
      update: { description: p.description },
    });
  }

  const slug = process.env.POS_INITIAL_RESTAURANT_SLUG?.trim() || "default";
  const name = process.env.POS_INITIAL_RESTAURANT_NAME?.trim() || "Mon restaurant";

  const restaurant = await prisma.restaurant.upsert({
    where: { slug },
    create: {
      name,
      slug,
      timezone: "Africa/Algiers",
      currencyCode: "DZD",
    },
    update: { name },
  });

  const permRecords = await prisma.permission.findMany();
  const permByCode = new Map(permRecords.map((x) => [x.code, x.id]));

  const roleRecords: Record<RoleCode, { id: string }> = {} as Record<RoleCode, { id: string }>;

  for (const code of Object.keys(ROLE_MATRIX) as RoleCode[]) {
    const role = await prisma.role.upsert({
      where: { restaurantId_code: { restaurantId: restaurant.id, code } },
      create: {
        restaurantId: restaurant.id,
        code,
        name: code[0]! + code.slice(1).toLowerCase(),
        description: `System role ${code}`,
        isSystem: true,
      },
      update: {},
    });
    roleRecords[code] = { id: role.id };

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

  const adminPassword = await bcrypt.hash(
    process.env.POS_INITIAL_ADMIN_PASSWORD?.trim() || "admin",
    BCRYPT_ROUNDS,
  );

  const adminUser = await prisma.user.upsert({
    where: { restaurantId_username: { restaurantId: restaurant.id, username: "admin" } },
    create: {
      restaurantId: restaurant.id,
      fullName: "Administrator",
      username: process.env.POS_INITIAL_ADMIN_USERNAME?.trim() || "admin",
      email: null,
      hashedPassword: adminPassword,
      pinHash: null,
      status: "ACTIVE",
    },
    update: { hashedPassword: adminPassword, status: "ACTIVE" },
  });

  await prisma.userRole.deleteMany({ where: { userId: adminUser.id } });
  await prisma.userRole.create({
    data: { userId: adminUser.id, roleId: roleRecords.ADMIN!.id },
  });

  await prisma.systemSettings.upsert({
    where: { restaurantId: restaurant.id },
    create: {
      restaurantId: restaurant.id,
      restaurantName: name,
      address: "",
      phone: "",
      settingsJson: { ...defaultSystemSettingsJson } as Prisma.InputJsonValue,
    },
    update: {
      restaurantName: name,
      settingsJson: { ...defaultSystemSettingsJson } as Prisma.InputJsonValue,
    },
  });

  await seedExpenseCategories(restaurant.id);

  // eslint-disable-next-line no-console -- seed script
  console.log(
    `Seed complete: restaurant slug="${slug}", admin user (set POS_INITIAL_ADMIN_PASSWORD to override default). No sample menu, tables, or orders.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
