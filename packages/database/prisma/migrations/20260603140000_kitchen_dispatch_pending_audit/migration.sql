-- Add DISPATCH_PENDING to kitchen mutation enum (required for dispatch-pending pipeline).
ALTER TYPE "KitchenMutationKind" ADD VALUE IF NOT EXISTS 'DISPATCH_PENDING';

-- Per-line kitchen dispatch audit trail.
CREATE TABLE "kitchen_dispatch_audit_logs" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID,
    "mutation_kind" "KitchenMutationKind" NOT NULL,
    "intent_id" UUID NOT NULL,
    "print_job_id" UUID,
    "status" VARCHAR(32) NOT NULL,
    "dispatched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_dispatch_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kitchen_dispatch_audit_logs_order_id_dispatched_at_idx" ON "kitchen_dispatch_audit_logs"("order_id", "dispatched_at");
CREATE INDEX "kitchen_dispatch_audit_logs_restaurant_id_order_id_dispatched_at_idx" ON "kitchen_dispatch_audit_logs"("restaurant_id", "order_id", "dispatched_at");
CREATE INDEX "kitchen_dispatch_audit_logs_intent_id_idx" ON "kitchen_dispatch_audit_logs"("intent_id");
CREATE INDEX "kitchen_dispatch_audit_logs_order_item_id_idx" ON "kitchen_dispatch_audit_logs"("order_item_id");

ALTER TABLE "kitchen_dispatch_audit_logs" ADD CONSTRAINT "kitchen_dispatch_audit_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
