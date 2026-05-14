-- Offline-first: idempotent dine-in / takeaway order creation keyed by client mutation id.
ALTER TABLE "orders" ADD COLUMN "offline_client_mutation_id" VARCHAR(128);

CREATE UNIQUE INDEX "orders_restaurant_id_offline_client_mutation_id_key" ON "orders"("restaurant_id", "offline_client_mutation_id");
