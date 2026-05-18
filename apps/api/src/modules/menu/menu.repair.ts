export async function repairKitchenStations(prisma: any): Promise<void> {
  const items = await prisma.menuItem.findMany({
    include: {
      category: true,
    },
  });

  for (const item of items) {
    if (item.kitchenStation) continue;

    const category = (item.category?.name || "").toLowerCase();
    const name = (item.name || "").toLowerCase();

    let station: string | null = null;

    if (category.includes("pizza") || name.includes("mergue")) {
      station = "PIZZA";
    } else if (
      category.includes("entrée") ||
      category.includes("plat") ||
      category.includes("poisson") ||
      name.includes("salade")
    ) {
      station = "PLATS";
    } else if (category.includes("snack") || category.includes("burger") || category.includes("sandwich")) {
      station = "SNACK";
    } else if (category.includes("boisson") || category.includes("drink") || name.includes("jus")) {
      station = "CAFETERIA";
    }

    if (station) {
      await prisma.menuItem.update({
        where: { id: item.id },
        data: { kitchenStation: station },
      });

      console.log("REPAIRED", item.name, station);
    }
  }
}
