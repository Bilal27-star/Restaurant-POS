import type { PrismaClient } from "@pos/database";

import { resolveKitchenStation } from "./kitchen-station.js";

export async function repairKitchenStations(prisma: PrismaClient): Promise<void> {
  const items = await prisma.menuItem.findMany({
    where: { kitchenStation: null, deletedAt: null },
    include: { category: true },
  });

  for (const item of items) {
    const station = resolveKitchenStation(item.category?.name, item.name);
    if (!station) continue;

    await prisma.menuItem.update({
      where: { id: item.id },
      data: { kitchenStation: station },
    });

    console.warn("[STATION RESOLVED]", {
      menuItemId: item.id,
      name: item.name,
      category: item.category?.name ?? null,
      station,
      source: "menu.repair",
    });
  }
}
