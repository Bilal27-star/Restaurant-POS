import type { KitchenStation, PrinterRole, Prisma } from "@pos/database";

type RestaurantPrinter = Prisma.RestaurantPrinterGetPayload<Record<string, never>>;

export type PrinterDto = {
  id: string;
  name: string;
  role: PrinterRole;
  kitchenStation: KitchenStation | null;
  driver: string;
  connectionJson: unknown;
  paperWidthChars: number;
  isDefault: boolean;
  isActive: boolean;
};

export function serializePrinter(p: RestaurantPrinter): PrinterDto {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    kitchenStation: p.kitchenStation,
    driver: p.driver,
    connectionJson: p.connectionJson,
    paperWidthChars: p.paperWidthChars,
    isDefault: p.isDefault,
    isActive: p.isActive,
  };
}
