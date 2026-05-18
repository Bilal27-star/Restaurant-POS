/*
  Warnings:

  - A unique constraint covering the columns `[restaurant_id,role,kitchen_station]` on the table `restaurant_printers` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "restaurant_printers_restaurant_id_role_is_active_idx";

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "kitchenStation" "KitchenStation";

-- AlterTable
ALTER TABLE "restaurant_printers" ADD COLUMN     "kitchen_station" "KitchenStation";

-- CreateIndex
CREATE INDEX "restaurant_printers_restaurant_id_role_kitchen_station_is_a_idx" ON "restaurant_printers"("restaurant_id", "role", "kitchen_station", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_printers_restaurant_id_role_kitchen_station_key" ON "restaurant_printers"("restaurant_id", "role", "kitchen_station");
