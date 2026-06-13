-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN "kitchen_station" "KitchenStation";

-- Backfill known category → station mappings (case-insensitive name match)
UPDATE "menu_categories"
SET "kitchen_station" = 'PIZZA'
WHERE "kitchen_station" IS NULL
  AND lower(trim("name")) = 'pizza';

UPDATE "menu_categories"
SET "kitchen_station" = 'SNACK'
WHERE "kitchen_station" IS NULL
  AND lower(trim("name")) IN ('snacks', 'snack');

UPDATE "menu_categories"
SET "kitchen_station" = 'PLATS'
WHERE "kitchen_station" IS NULL
  AND lower(trim("name")) IN ('plats', 'entrées', 'entrees', 'entrée', 'entree', 'poissons', 'poisson');

UPDATE "menu_categories"
SET "kitchen_station" = 'CAFETERIA'
WHERE "kitchen_station" IS NULL
  AND lower(trim("name")) IN ('cafeteria', 'cafétéria');
