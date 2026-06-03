-- CreateEnum
CREATE TYPE "OrderLineMutationKind" AS ENUM ('LINE_ADD', 'LINE_UPDATE', 'LINE_DELETE');

-- CreateTable
CREATE TABLE "order_line_mutation_idempotency" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "client_mutation_id" VARCHAR(128) NOT NULL,
    "kind" "OrderLineMutationKind" NOT NULL,
    "order_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_line_mutation_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_line_mutation_idempotency_order_id_idx" ON "order_line_mutation_idempotency"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_line_mutation_idempotency_restaurant_id_client_mutati_key" ON "order_line_mutation_idempotency"("restaurant_id", "client_mutation_id");

-- AddForeignKey
ALTER TABLE "order_line_mutation_idempotency" ADD CONSTRAINT "order_line_mutation_idempotency_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_mutation_idempotency" ADD CONSTRAINT "order_line_mutation_idempotency_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
