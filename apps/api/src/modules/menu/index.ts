import { prisma } from "@pos/database";

import { repairKitchenStations } from "./menu.repair.js";

repairKitchenStations(prisma).catch(console.error);

export { createMenuRouter } from "./menu.routes.js";
export { MenuController } from "./menu.controller.js";
export { MenuService } from "./menu.service.js";
export { MenuRepository } from "./menu.repository.js";
export { repairKitchenStations } from "./menu.repair.js";
