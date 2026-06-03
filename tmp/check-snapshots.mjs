import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const oid = process.argv[2] ?? "08310c25-10bc-4137-9d55-ef6a94136e56";

const items = await prisma.orderItem.findMany({
  where: { orderId: oid },
  select: {
    nameSnapshot: true,
    quantity: true,
    kitchenStatus: true,
    kitchenSnapshotHash: true,
    kitchenLastSentSnapshot: true,
  },
});
console.log(JSON.stringify(items, null, 2));
await prisma.$disconnect();
