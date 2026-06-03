-- Kitchen Delta Printing Phase 1: per-line kitchen state on order_items + order dispatch generation.

-- CreateEnum
CREATE TYPE "OrderItemKitchenStatus" AS ENUM ('PENDING', 'SENT', 'MODIFIED', 'PRINT_FAILED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "kitchen_dispatch_generation" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "kitchen_status" "OrderItemKitchenStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "order_items" ADD COLUMN "kitchen_station" "KitchenStation";
ALTER TABLE "order_items" ADD COLUMN "kitchen_sent_at" TIMESTAMP(3);
ALTER TABLE "order_items" ADD COLUMN "kitchen_revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN "kitchen_last_sent_snapshot" JSONB;
ALTER TABLE "order_items" ADD COLUMN "kitchen_snapshot_hash" VARCHAR(64);

-- CreateIndex
CREATE INDEX "order_items_order_id_kitchen_status_idx" ON "order_items"("order_id", "kitchen_status");
