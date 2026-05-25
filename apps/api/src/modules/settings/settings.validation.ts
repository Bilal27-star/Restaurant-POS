import { z } from "zod";

const backupRow = z.record(z.unknown());

export const restaurantBackupPayloadSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string().min(1),
    restaurantId: z.string().uuid(),
    restaurant: backupRow,
    systemSettings: backupRow.nullable(),
    users: z.array(backupRow),
    userRoles: z.array(backupRow),
    floors: z.array(backupRow),
    tables: z.array(backupRow),
    tableReservations: z.array(backupRow),
    menuCategories: z.array(backupRow),
    menuItems: z.array(backupRow),
    ingredients: z.array(backupRow),
    modifiers: z.array(backupRow),
    menuItemModifiers: z.array(backupRow),
    customers: z.array(backupRow),
    printers: z.array(backupRow),
    orders: z.array(backupRow),
    orderItems: z.array(backupRow),
    orderItemModifiers: z.array(backupRow),
    payments: z.array(backupRow),
    refunds: z.array(backupRow),
    shifts: z.array(backupRow),
    expenses: z.array(backupRow),
    cashTransactions: z.array(backupRow),
    orderNumberCounters: z.array(backupRow),
    expenseCategories: z.array(backupRow),
  })
  .strict();

export const restoreBackupBody = restaurantBackupPayloadSchema;

export const patchSystemSettingsBody = z
  .object({
    restaurantName: z.string().min(1).max(200).optional(),
    address: z.string().max(500).nullable().optional(),
    phone: z.string().max(80).nullable().optional(),
    settingsJson: z.record(z.unknown()).optional(),
  })
  .strict()
  .refine((o) => o.restaurantName !== undefined || o.address !== undefined || o.phone !== undefined || o.settingsJson !== undefined, {
    message: "At least one field required",
  });
