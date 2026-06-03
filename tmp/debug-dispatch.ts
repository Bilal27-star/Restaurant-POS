import { prisma } from "../apps/api/src/prisma/index.js";
import { KitchenDeltaRepository } from "../apps/api/src/modules/kitchen-delta/kitchen-delta.repository.ts";
import { detectKitchenDispatchIntent } from "../apps/api/src/modules/kitchen-delta/kitchen-delta-detector.ts";
import { buildKitchenDetectContext } from "../apps/api/src/modules/kitchen-delta/kitchen-delta-shadow.context.ts";

async function main() {
const orderId = process.argv[2];
if (!orderId) {
  console.error("usage: npx tsx tmp/debug-dispatch.ts <orderId>");
  process.exit(1);
}

const order = await prisma.order.findFirstOrThrow({
  where: { id: orderId },
  include: {
    table: true,
    waiter: true,
    items: { include: { modifiers: true, menuItem: { include: { category: true } } } },
  },
});

const repo = new KitchenDeltaRepository();
const lines = await repo.loadKitchenDetectLines(prisma, order.restaurantId, orderId);

for (const line of lines) {
  console.log(line.nameSnapshot, {
    qty: line.quantity,
    status: line.kitchenStatus,
    hasSnap: line.kitchenLastSentSnapshot != null,
    hash: line.kitchenSnapshotHash,
  });
}

const ctx = buildKitchenDetectContext(
  {
    kind: "DISPATCH_PENDING",
    restaurantId: order.restaurantId,
    order: order as never,
    clientMutationId: "debug",
    mutationApplied: true,
    removedLines: [],
  },
  lines,
);

const intent = detectKitchenDispatchIntent(ctx);
console.log("intent", intent ? { mode: intent.ticketMode, bundles: intent.stationBundles.length } : null);

await prisma.$disconnect();
}

void main();
