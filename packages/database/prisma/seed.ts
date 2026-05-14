import { createHmac, randomInt } from "node:crypto";

import { ExpenseCategoryCode, PrismaClient, RoleCode, type Prisma } from "@prisma/client";
import bcrypt from "bcrypt";

import { defaultSystemSettingsJson } from "../src/default-settings.js";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const PEPPER = process.env.PIN_PEPPER ?? "change-me-pin-pepper-min-32-chars-long";

function digestPin(pin: string): string {
  return createHmac("sha256", PEPPER).update(`pos-pin-v1|${pin}`).digest("hex");
}

async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(digestPin(pin), BCRYPT_ROUNDS);
}

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

async function purgeRestaurantOrders(restaurantId: string): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { restaurantId },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  if (orderIds.length === 0) return;

  const payments = await prisma.payment.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);

  if (paymentIds.length > 0) {
    await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.cashTransaction.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  }

  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
}

function seedTicketPublicCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[randomInt(chars.length)]!;
  }
  return out;
}

async function seedFloorsAndTables(restaurantId: string): Promise<void> {
  await purgeRestaurantOrders(restaurantId);

  await prisma.tableReservation.deleteMany({ where: { table: { restaurantId } } });
  await prisma.restaurantTable.updateMany({
    where: { restaurantId },
    data: { currentOrderId: null },
  });
  await prisma.restaurantTable.deleteMany({ where: { restaurantId } });
  await prisma.restaurantFloor.deleteMany({ where: { restaurantId } });

  const salle = await prisma.restaurantFloor.create({
    data: { restaurantId, name: "Salle 1", sortOrder: 0 },
  });

  const tableDefs: { number: string; capacity: number; floorId: string }[] = [];
  for (let n = 1; n <= 12; n++) {
    tableDefs.push({ number: String(n), capacity: n <= 4 ? 6 : 4, floorId: salle.id });
  }

  await prisma.restaurantTable.createMany({
    data: tableDefs.map((t) => ({
      restaurantId,
      floorId: t.floorId,
      number: t.number,
      capacity: t.capacity,
      status: "FREE" as const,
    })),
  });
}

async function seedDineInSampleOrders(restaurantId: string, waiterId: string): Promise<void> {
  const floor = await prisma.restaurantFloor.findFirst({
    where: { restaurantId },
    orderBy: { sortOrder: "asc" },
  });
  if (!floor) return;

  const tablesRaw = await prisma.restaurantTable.findMany({
    where: { restaurantId, floorId: floor.id },
  });
  const tables = [...tablesRaw].sort((a, b) => Number.parseInt(a.number, 10) - Number.parseInt(b.number, 10));

  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, basePrice: true },
  });

  if (tables.length < 5 || menuItems.length === 0) return;

  const pick = (needle: string) =>
    menuItems.find((m) => m.name.toLowerCase().includes(needle.toLowerCase())) ?? menuItems[0]!;

  const salad = pick("Salade");
  const couscous = pick("Couscous");
  const tea = pick("Thé");
  const baklava = pick("Baklava");
  const water = pick("Eau");

  const year = new Date().getUTCFullYear();

  type LineSpec = { item: (typeof menuItems)[0]; qty: number };

  const scenarios: LineSpec[][] = [
    [
      { item: salad, qty: 2 },
      { item: tea, qty: 2 },
    ],
    [
      { item: couscous, qty: 1 },
      { item: tea, qty: 1 },
    ],
    [
      { item: couscous, qty: 2 },
      { item: water, qty: 2 },
    ],
    [
      { item: salad, qty: 1 },
      { item: baklava, qty: 2 },
      { item: tea, qty: 1 },
    ],
    [
      { item: couscous, qty: 1 },
      { item: baklava, qty: 1 },
      { item: water, qty: 3 },
    ],
  ];

  for (let i = 0; i < 5 && i < tables.length && i < scenarios.length; i++) {
    const table = tables[i]!;
    const spec = scenarios[i]!;
    const openedAt = new Date(Date.now() - (12 + i * 7) * 60_000);

    await prisma.$transaction(async (tx) => {
      const counter = await tx.orderNumberCounter.upsert({
        where: { restaurantId_year: { restaurantId, year } },
        create: { restaurantId, year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const orderNumber = `${year}-${String(counter.lastNumber).padStart(6, "0")}`;

      let ticketPublicCode = seedTicketPublicCode();
      for (let attempt = 0; attempt < 10; attempt++) {
        const clash = await tx.order.findFirst({
          where: { restaurantId, ticketPublicCode },
          select: { id: true },
        });
        if (!clash) break;
        ticketPublicCode = seedTicketPublicCode();
      }

      const partySize = 2 + (i % 4);

      const order = await tx.order.create({
        data: {
          restaurantId,
          orderNumber,
          ticketPublicCode,
          type: "DINE_IN",
          status: "PREPARING",
          tableId: table.id,
          waiterId,
          partySize,
          createdByUserId: waiterId,
          kitchenNotes: "",
          customerNotes: "",
          subtotal: new Prisma.Decimal(0),
          taxTotal: new Prisma.Decimal(0),
          discountTotal: new Prisma.Decimal(0),
          total: new Prisma.Decimal(0),
          paidTotal: new Prisma.Decimal(0),
          paymentStatus: "UNPAID",
          openedAt,
        },
      });

      let sortOrder = 0;
      let subtotal = new Prisma.Decimal(0);

      for (const line of spec) {
        const unit = line.item.basePrice;
        const lineSubtotal = unit.mul(line.qty);
        subtotal = subtotal.add(lineSubtotal);
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: line.item.id,
            nameSnapshot: line.item.name,
            unitPrice: unit,
            quantity: line.qty,
            lineSubtotal,
            sortOrder: sortOrder++,
            kitchenNotes: null,
            removedIngredients: [],
          },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          subtotal,
          total: subtotal,
          taxTotal: new Prisma.Decimal(0),
          discountTotal: new Prisma.Decimal(0),
        },
      });

      await tx.restaurantTable.update({
        where: { id: table.id },
        data: { status: "OCCUPIED", currentOrderId: order.id },
      });
    });
  }
}

async function seedMenuCatalog(restaurantId: string): Promise<void> {
  await prisma.menuItemModifier.deleteMany({ where: { menuItem: { restaurantId } } });
  await prisma.modifier.deleteMany({ where: { menuItem: { restaurantId } } });
  await prisma.ingredient.deleteMany({ where: { menuItem: { restaurantId } } });
  await prisma.menuItem.deleteMany({ where: { restaurantId } });
  await prisma.menuCategory.deleteMany({ where: { restaurantId } });

  const starters = await prisma.menuCategory.create({
    data: {
      restaurantId,
      name: "Entrées",
      slug: "starters",
      sortOrder: 0,
      colorToken: "emerald",
    },
  });
  const mains = await prisma.menuCategory.create({
    data: {
      restaurantId,
      name: "Plats",
      slug: "mains",
      sortOrder: 1,
      colorToken: "amber",
    },
  });
  const desserts = await prisma.menuCategory.create({
    data: {
      restaurantId,
      name: "Desserts",
      slug: "desserts",
      sortOrder: 2,
      colorToken: "rose",
    },
  });
  const drinks = await prisma.menuCategory.create({
    data: {
      restaurantId,
      name: "Boissons",
      slug: "drinks",
      sortOrder: 3,
      colorToken: "sky",
    },
  });

  const salad = await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId: starters.id,
      name: "Salade méditerranéenne",
      description: "Tomates, concombre, feta, olives",
      basePrice: new Prisma.Decimal("380.00"),
      available: true,
      popular: true,
      sortOrder: 0,
      ingredients: {
        create: [
          { name: "Feta", removable: false, sortOrder: 0 },
          { name: "Olives", removable: true, sortOrder: 1 },
        ],
      },
      modifiers: {
        create: [
          { name: "Poulet grillé", extraPrice: new Prisma.Decimal("120.00"), sortOrder: 0 },
          { name: "Supplément avocat", extraPrice: new Prisma.Decimal("90.00"), sortOrder: 1 },
        ],
      },
    },
    include: { modifiers: true },
  });
  for (const m of salad.modifiers) {
    await prisma.menuItemModifier.create({
      data: { menuItemId: salad.id, modifierId: m.id, sortOrder: m.sortOrder },
    });
  }

  const couscous = await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId: mains.id,
      name: "Couscous royal",
      description: "Semoule, légumes, merguez, poulet, agneau",
      basePrice: new Prisma.Decimal("1250.00"),
      available: true,
      popular: true,
      sortOrder: 0,
      ingredients: {
        create: [
          { name: "Semoule", removable: false, sortOrder: 0 },
          { name: "Harissa", removable: true, sortOrder: 1 },
        ],
      },
      modifiers: {
        create: [{ name: "Portion XL", extraPrice: new Prisma.Decimal("200.00"), sortOrder: 0 }],
      },
    },
    include: { modifiers: true },
  });
  for (const m of couscous.modifiers) {
    await prisma.menuItemModifier.create({
      data: { menuItemId: couscous.id, modifierId: m.id, sortOrder: m.sortOrder },
    });
  }

  await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId: mains.id,
      name: "Poisson du jour",
      description: "Selon arrivage",
      basePrice: new Prisma.Decimal("980.00"),
      available: true,
      popular: false,
      sortOrder: 1,
    },
  });

  await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId: desserts.id,
      name: "Baklava maison",
      description: "Pistache, miel",
      basePrice: new Prisma.Decimal("220.00"),
      available: true,
      popular: true,
      sortOrder: 0,
    },
  });

  await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId: drinks.id,
      name: "Thé à la menthe",
      description: "",
      basePrice: new Prisma.Decimal("80.00"),
      available: true,
      popular: true,
      sortOrder: 0,
    },
  });
  await prisma.menuItem.create({
    data: {
      restaurantId,
      categoryId: drinks.id,
      name: "Eau minérale 50cl",
      description: "",
      basePrice: new Prisma.Decimal("60.00"),
      available: true,
      popular: false,
      sortOrder: 1,
    },
  });
}

async function seedPrinters(restaurantId: string): Promise<void> {
  await prisma.printJob.deleteMany({ where: { restaurantId } });
  await prisma.restaurantPrinter.deleteMany({ where: { restaurantId } });

  await prisma.restaurantPrinter.createMany({
    data: [
      {
        restaurantId,
        name: "Cuisine — USB",
        role: "KITCHEN",
        driver: "RAW_ESCPOS",
        connectionJson: { kind: "usb_placeholder", note: "Configure in production" },
        paperWidthChars: 32,
        isDefault: true,
        isActive: true,
      },
      {
        restaurantId,
        name: "Caisse — reçu",
        role: "RECEIPT",
        driver: "RAW_ESCPOS",
        connectionJson: { kind: "spool_placeholder" },
        paperWidthChars: 32,
        isDefault: false,
        isActive: true,
      },
    ],
  });
}

async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: { code: p.code, description: p.description },
      update: { description: p.description },
    });
  }

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: "demo" },
    create: {
      name: "Demo Restaurant",
      slug: "demo",
      timezone: "Africa/Algiers",
      currencyCode: "DZD",
    },
    update: {},
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

  const adminPassword = await bcrypt.hash("admin", BCRYPT_ROUNDS);
  const cashierPin = await hashPin("4829");
  const waiterPin = await hashPin("7391");
  const managerPin = await hashPin("5620");
  const randomUnusedPassword = await bcrypt.hash(`bootstrap-${restaurant.id}`, BCRYPT_ROUNDS);

  const adminUser = await prisma.user.upsert({
    where: { restaurantId_username: { restaurantId: restaurant.id, username: "admin" } },
    create: {
      restaurantId: restaurant.id,
      fullName: "Site Administrator",
      username: "admin",
      email: "admin@demo.local",
      hashedPassword: adminPassword,
      pinHash: null,
      status: "ACTIVE",
    },
    update: { hashedPassword: adminPassword, status: "ACTIVE" },
  });

  const cashierUser = await prisma.user.upsert({
    where: { restaurantId_username: { restaurantId: restaurant.id, username: "cashier1" } },
    create: {
      restaurantId: restaurant.id,
      fullName: "Marie Caissier",
      username: "cashier1",
      email: "cashier1@demo.local",
      hashedPassword: adminPassword,
      pinHash: cashierPin,
      status: "ACTIVE",
    },
    update: { pinHash: cashierPin, status: "ACTIVE" },
  });

  const waiterUser = await prisma.user.upsert({
    where: { restaurantId_username: { restaurantId: restaurant.id, username: "waiter1" } },
    create: {
      restaurantId: restaurant.id,
      fullName: "Sam Serveur",
      username: "waiter1",
      email: null,
      hashedPassword: randomUnusedPassword,
      pinHash: waiterPin,
      status: "ACTIVE",
    },
    update: { pinHash: waiterPin, status: "ACTIVE" },
  });

  const managerUser = await prisma.user.upsert({
    where: { restaurantId_username: { restaurantId: restaurant.id, username: "manager1" } },
    create: {
      restaurantId: restaurant.id,
      fullName: "Alex Manager",
      username: "manager1",
      email: "manager1@demo.local",
      hashedPassword: adminPassword,
      pinHash: managerPin,
      status: "ACTIVE",
    },
    update: { pinHash: managerPin, status: "ACTIVE" },
  });

  await prisma.userRole.deleteMany({ where: { userId: adminUser.id } });
  await prisma.userRole.createMany({
    data: [{ userId: adminUser.id, roleId: roleRecords.ADMIN!.id }],
  });

  await prisma.userRole.deleteMany({ where: { userId: cashierUser.id } });
  await prisma.userRole.createMany({
    data: [{ userId: cashierUser.id, roleId: roleRecords.CASHIER!.id }],
  });

  await prisma.userRole.deleteMany({ where: { userId: waiterUser.id } });
  await prisma.userRole.createMany({
    data: [{ userId: waiterUser.id, roleId: roleRecords.WAITER!.id }],
  });

  await prisma.userRole.deleteMany({ where: { userId: managerUser.id } });
  await prisma.userRole.createMany({
    data: [{ userId: managerUser.id, roleId: roleRecords.MANAGER!.id }],
  });

  await prisma.systemSettings.upsert({
    where: { restaurantId: restaurant.id },
    create: {
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      address: "1 Rue de la Démo, Alger",
      phone: "+213 000 000 000",
      settingsJson: { ...defaultSystemSettingsJson } as Prisma.InputJsonValue,
    },
    update: {
      settingsJson: { ...defaultSystemSettingsJson } as Prisma.InputJsonValue,
    },
  });

  await seedExpenseCategories(restaurant.id);
  await seedFloorsAndTables(restaurant.id);
  await seedMenuCatalog(restaurant.id);
  await seedDineInSampleOrders(restaurant.id, waiterUser.id);
  await seedPrinters(restaurant.id);

  // eslint-disable-next-line no-console -- seed script
  console.log(
    "Seed complete: demo restaurant, Salle 1 (12 tables, 5 with open orders), menu, printers, expense categories. Users: admin (password: admin), cashier1, waiter1, manager1 — legacy demo password also used for cashier1/manager1 — PINs cashier 4829, waiter 7391, manager 5620.",
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
