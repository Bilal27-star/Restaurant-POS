-- Kitchen Delta Printing Phase 1.5: print ledger + kitchen audit.

-- CreateEnum
CREATE TYPE "KitchenPrintIntentStatus" AS ENUM ('PENDING', 'ENQUEUED', 'PARTIAL', 'FAILED', 'COMPLETED');
CREATE TYPE "KitchenPrintIntentStationStatus" AS ENUM ('PENDING', 'ENQUEUED', 'FAILED', 'COMPLETED');
CREATE TYPE "KitchenMutationKind" AS ENUM ('CREATE', 'LINE_ADD', 'LINE_UPDATE', 'LINE_DELETE', 'ORDER_INFO', 'FULL_REPRINT');
CREATE TYPE "KitchenTicketMode" AS ENUM ('NEW', 'UPDATE', 'CANCEL', 'INFO', 'FULL_REPRINT');
CREATE TYPE "OrderItemKitchenAuditEvent" AS ENUM ('SENT', 'MODIFIED', 'REMOVED', 'PRINT_FAILED', 'FULL_REPRINT');

-- CreateTable
CREATE TABLE "kitchen_print_intents" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "client_mutation_id" VARCHAR(128) NOT NULL,
    "line_mutation_idempotency_id" UUID,
    "mutation_kind" "KitchenMutationKind" NOT NULL,
    "ticket_mode" "KitchenTicketMode" NOT NULL,
    "status" "KitchenPrintIntentStatus" NOT NULL DEFAULT 'PENDING',
    "payload_json" JSONB NOT NULL,
    "dispatch_generation_at_create" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "enqueued_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "kitchen_print_intents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kitchen_print_intent_stations" (
    "id" UUID NOT NULL,
    "intent_id" UUID NOT NULL,
    "station" "KitchenStation" NOT NULL,
    "status" "KitchenPrintIntentStationStatus" NOT NULL DEFAULT 'PENDING',
    "print_job_id" UUID,
    "payload_json" JSONB NOT NULL,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "enqueued_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "kitchen_print_intent_stations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_item_kitchen_audit" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "event" "OrderItemKitchenAuditEvent" NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "intent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_kitchen_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_print_intents_restaurant_id_client_mutation_id_key" ON "kitchen_print_intents"("restaurant_id", "client_mutation_id");
CREATE INDEX "kitchen_print_intents_order_id_idx" ON "kitchen_print_intents"("order_id");
CREATE INDEX "kitchen_print_intents_restaurant_id_status_created_at_idx" ON "kitchen_print_intents"("restaurant_id", "status", "created_at");
CREATE INDEX "kitchen_print_intents_status_created_at_idx" ON "kitchen_print_intents"("status", "created_at");

CREATE UNIQUE INDEX "kitchen_print_intent_stations_print_job_id_key" ON "kitchen_print_intent_stations"("print_job_id");
CREATE UNIQUE INDEX "kitchen_print_intent_stations_intent_id_station_key" ON "kitchen_print_intent_stations"("intent_id", "station");
CREATE INDEX "kitchen_print_intent_stations_intent_id_status_idx" ON "kitchen_print_intent_stations"("intent_id", "status");

CREATE INDEX "order_item_kitchen_audit_order_id_created_at_idx" ON "order_item_kitchen_audit"("order_id", "created_at");
CREATE INDEX "order_item_kitchen_audit_restaurant_id_order_id_created_at_idx" ON "order_item_kitchen_audit"("restaurant_id", "order_id", "created_at");
CREATE INDEX "order_item_kitchen_audit_intent_id_idx" ON "order_item_kitchen_audit"("intent_id");
CREATE INDEX "order_item_kitchen_audit_order_item_id_idx" ON "order_item_kitchen_audit"("order_item_id");

-- AddForeignKey
ALTER TABLE "kitchen_print_intents" ADD CONSTRAINT "kitchen_print_intents_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kitchen_print_intents" ADD CONSTRAINT "kitchen_print_intents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kitchen_print_intents" ADD CONSTRAINT "kitchen_print_intents_line_mutation_idempotency_id_fkey" FOREIGN KEY ("line_mutation_idempotency_id") REFERENCES "order_line_mutation_idempotency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kitchen_print_intent_stations" ADD CONSTRAINT "kitchen_print_intent_stations_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "kitchen_print_intents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kitchen_print_intent_stations" ADD CONSTRAINT "kitchen_print_intent_stations_print_job_id_fkey" FOREIGN KEY ("print_job_id") REFERENCES "print_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_item_kitchen_audit" ADD CONSTRAINT "order_item_kitchen_audit_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_item_kitchen_audit" ADD CONSTRAINT "order_item_kitchen_audit_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "kitchen_print_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
