-- Analytics dashboard hot paths: day-range scans on orders and payment completion timelines.
CREATE INDEX IF NOT EXISTS "orders_restaurant_id_opened_at_idx" ON "orders" ("restaurant_id", "opened_at");
CREATE INDEX IF NOT EXISTS "orders_restaurant_id_status_closed_at_idx" ON "orders" ("restaurant_id", "status", "closed_at");
CREATE INDEX IF NOT EXISTS "payments_restaurant_id_status_processed_at_idx" ON "payments" ("restaurant_id", "status", "processed_at");
