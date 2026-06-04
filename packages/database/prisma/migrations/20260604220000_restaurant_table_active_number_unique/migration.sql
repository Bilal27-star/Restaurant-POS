-- Allow reusing table numbers after soft delete.
-- Replaces full-table unique index with partial unique on active rows only.

DROP INDEX IF EXISTS "restaurant_tables_restaurant_id_floor_id_number_key";

CREATE UNIQUE INDEX "restaurant_tables_restaurant_id_floor_id_number_active_key"
  ON "restaurant_tables" ("restaurant_id", "floor_id", "number")
  WHERE "deleted_at" IS NULL;
