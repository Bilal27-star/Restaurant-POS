-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'VACATION', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('ADMIN', 'MANAGER', 'CASHIER', 'WAITER');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('FREE', 'OCCUPIED', 'RESERVED', 'PAYMENT_PENDING');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'RECONCILED');

-- CreateEnum
CREATE TYPE "ExpenseCategoryCode" AS ENUM ('INGREDIENTS', 'MAINTENANCE', 'CLEANING', 'UTILITIES', 'DELIVERY', 'SALARIES', 'OTHER');

-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('OPENING_FLOAT', 'SALE_IN', 'EXPENSE_OUT', 'REFUND_OUT', 'DRAWER_ADJUSTMENT', 'CLOSE_COUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "SyncMutationStatus" AS ENUM ('PENDING', 'SENT', 'ACKNOWLEDGED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "PrinterRole" AS ENUM ('KITCHEN', 'CASHIER', 'RECEIPT');

-- CreateEnum
CREATE TYPE "PrintJobKind" AS ENUM ('TABLE_TICKET', 'KITCHEN_TICKET', 'CUSTOMER_RECEIPT', 'SHIFT_SUMMARY', 'EXPENSE_RECEIPT');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency_code" TEXT NOT NULL DEFAULT 'DZD',
    "legal_name" TEXT,
    "tax_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "restaurant_name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "settings_json" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "hashed_password" TEXT NOT NULL,
    "pin_hash" TEXT,
    "avatar_url" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" INET,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_audit_logs" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID,
    "username_attempted" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL,
    "failure_reason" TEXT,
    "event" TEXT NOT NULL DEFAULT 'login',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_audit_logs" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "metadata_json" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_floors" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "restaurant_floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_tables" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "floor_id" UUID,
    "number" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'FREE',
    "current_order_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_reservations" (
    "id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "party_name" TEXT NOT NULL,
    "party_size" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "color_token" TEXT,
    "icon_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "image_url" TEXT,
    "base_price" DECIMAL(14,2) NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "removable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifiers" (
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "extra_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_modifiers" (
    "id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "modifier_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "ticket_public_code" TEXT,
    "last_ticket_printed_at" TIMESTAMP(3),
    "ticket_qr_schema_version" INTEGER NOT NULL DEFAULT 1,
    "type" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "table_id" UUID,
    "customer_id" UUID,
    "waiter_id" UUID,
    "party_size" INTEGER,
    "created_by_user_id" UUID,
    "kitchen_notes" TEXT DEFAULT '',
    "customer_notes" TEXT DEFAULT '',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_number_counters" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID,
    "name_snapshot" TEXT NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "kitchen_notes" TEXT,
    "removed_ingredients" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "modifier_id" UUID,
    "label" TEXT NOT NULL,
    "price_delta" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "shift_id" UUID,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "amount_received" DECIMAL(14,2),
    "change_given" DECIMAL(14,2),
    "idempotency_key" TEXT,
    "recorded_by_user_id" UUID,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "type" "CashTransactionType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_id" UUID,
    "expense_id" UUID,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "closed_by_user_id" UUID,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "opening_cash_float" DECIMAL(14,2) NOT NULL,
    "closing_cash_count" DECIMAL(14,2),
    "expected_cash" DECIMAL(14,2),
    "variance" DECIMAL(14,2),
    "gross_sales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cash_sales_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "card_sales_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transfer_sales_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refunds_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "code" "ExpenseCategoryCode" NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "recorded_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_sales_snapshots" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "gross_sales" DECIMAL(14,2) NOT NULL,
    "net_sales" DECIMAL(14,2) NOT NULL,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "takeaway_count" INTEGER NOT NULL DEFAULT 0,
    "payment_cash" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_card" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "payment_transfer" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "detail_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_sales_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registered_devices" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "public_key" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registered_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_mutations" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "device_id" UUID,
    "user_id" UUID,
    "client_mutation_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "SyncMutationStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_mutations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_printers" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" "PrinterRole" NOT NULL,
    "driver" TEXT NOT NULL DEFAULT 'RAW_ESCPOS',
    "connection_json" JSONB NOT NULL DEFAULT '{}',
    "paper_width_chars" INTEGER NOT NULL DEFAULT 32,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_printers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "printer_id" UUID,
    "requested_by_user_id" UUID,
    "kind" "PrintJobKind" NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload_json" JSONB NOT NULL,
    "escpos_sha256" TEXT,
    "escpos_bytes_base64" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE INDEX "restaurants_deleted_at_idx" ON "restaurants"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_restaurant_id_key" ON "system_settings"("restaurant_id");

-- CreateIndex
CREATE INDEX "users_restaurant_id_status_idx" ON "users"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "users_restaurant_id_deleted_at_idx" ON "users"("restaurant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_restaurant_id_username_key" ON "users"("restaurant_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "users_restaurant_id_email_key" ON "users"("restaurant_id", "email");

-- CreateIndex
CREATE INDEX "roles_restaurant_id_idx" ON "roles"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_restaurant_id_code_key" ON "roles"("restaurant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_token_hash_idx" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "login_audit_logs_restaurant_id_created_at_idx" ON "login_audit_logs"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "login_audit_logs_user_id_created_at_idx" ON "login_audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "security_audit_logs_restaurant_id_created_at_idx" ON "security_audit_logs"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "security_audit_logs_actor_user_id_created_at_idx" ON "security_audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "restaurant_floors_restaurant_id_sort_order_idx" ON "restaurant_floors"("restaurant_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_current_order_id_key" ON "restaurant_tables"("current_order_id");

-- CreateIndex
CREATE INDEX "restaurant_tables_restaurant_id_status_idx" ON "restaurant_tables"("restaurant_id", "status");

-- CreateIndex
CREATE INDEX "restaurant_tables_floor_id_idx" ON "restaurant_tables"("floor_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_tables_restaurant_id_floor_id_number_key" ON "restaurant_tables"("restaurant_id", "floor_id", "number");

-- CreateIndex
CREATE INDEX "table_reservations_table_id_starts_at_idx" ON "table_reservations"("table_id", "starts_at");

-- CreateIndex
CREATE INDEX "menu_categories_restaurant_id_sort_order_idx" ON "menu_categories"("restaurant_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_restaurant_id_slug_key" ON "menu_categories"("restaurant_id", "slug");

-- CreateIndex
CREATE INDEX "menu_items_restaurant_id_category_id_sort_order_idx" ON "menu_items"("restaurant_id", "category_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_items_restaurant_id_available_idx" ON "menu_items"("restaurant_id", "available");

-- CreateIndex
CREATE INDEX "ingredients_menu_item_id_sort_order_idx" ON "ingredients"("menu_item_id", "sort_order");

-- CreateIndex
CREATE INDEX "modifiers_menu_item_id_sort_order_idx" ON "modifiers"("menu_item_id", "sort_order");

-- CreateIndex
CREATE INDEX "menu_item_modifiers_menu_item_id_sort_order_idx" ON "menu_item_modifiers"("menu_item_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_modifiers_menu_item_id_modifier_id_key" ON "menu_item_modifiers"("menu_item_id", "modifier_id");

-- CreateIndex
CREATE INDEX "customers_restaurant_id_phone_idx" ON "customers"("restaurant_id", "phone");

-- CreateIndex
CREATE INDEX "customers_restaurant_id_name_idx" ON "customers"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_status_created_at_idx" ON "orders"("restaurant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_type_created_at_idx" ON "orders"("restaurant_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "orders_restaurant_id_payment_status_idx" ON "orders"("restaurant_id", "payment_status");

-- CreateIndex
CREATE INDEX "orders_table_id_idx" ON "orders"("table_id");

-- CreateIndex
CREATE INDEX "orders_waiter_id_idx" ON "orders"("waiter_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurant_id_order_number_key" ON "orders"("restaurant_id", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_restaurant_id_ticket_public_code_key" ON "orders"("restaurant_id", "ticket_public_code");

-- CreateIndex
CREATE INDEX "order_number_counters_restaurant_id_idx" ON "order_number_counters"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_number_counters_restaurant_id_year_key" ON "order_number_counters"("restaurant_id", "year");

-- CreateIndex
CREATE INDEX "order_items_order_id_sort_order_idx" ON "order_items"("order_id", "sort_order");

-- CreateIndex
CREATE INDEX "order_item_modifiers_order_item_id_idx" ON "order_item_modifiers"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_order_id_idx" ON "payments"("restaurant_id", "order_id");

-- CreateIndex
CREATE INDEX "payments_shift_id_created_at_idx" ON "payments"("shift_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_restaurant_id_method_created_at_idx" ON "payments"("restaurant_id", "method", "created_at");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "cash_transactions_shift_id_created_at_idx" ON "cash_transactions"("shift_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_transactions_restaurant_id_type_created_at_idx" ON "cash_transactions"("restaurant_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "shifts_restaurant_id_status_opened_at_idx" ON "shifts"("restaurant_id", "status", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_restaurant_id_code_key" ON "expense_categories"("restaurant_id", "code");

-- CreateIndex
CREATE INDEX "expenses_shift_id_created_at_idx" ON "expenses"("shift_id", "created_at");

-- CreateIndex
CREATE INDEX "expenses_restaurant_id_category_id_created_at_idx" ON "expenses"("restaurant_id", "category_id", "created_at");

-- CreateIndex
CREATE INDEX "daily_sales_snapshots_restaurant_id_business_date_idx" ON "daily_sales_snapshots"("restaurant_id", "business_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_sales_snapshots_restaurant_id_business_date_key" ON "daily_sales_snapshots"("restaurant_id", "business_date");

-- CreateIndex
CREATE INDEX "registered_devices_restaurant_id_idx" ON "registered_devices"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_mutations_client_mutation_id_key" ON "sync_mutations"("client_mutation_id");

-- CreateIndex
CREATE INDEX "sync_mutations_restaurant_id_status_created_at_idx" ON "sync_mutations"("restaurant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "restaurant_printers_restaurant_id_role_is_active_idx" ON "restaurant_printers"("restaurant_id", "role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_printers_restaurant_id_name_key" ON "restaurant_printers"("restaurant_id", "name");

-- CreateIndex
CREATE INDEX "print_jobs_restaurant_id_status_priority_created_at_idx" ON "print_jobs"("restaurant_id", "status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "print_jobs_printer_id_status_idx" ON "print_jobs"("printer_id", "status");

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_audit_logs" ADD CONSTRAINT "login_audit_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_audit_logs" ADD CONSTRAINT "login_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_floors" ADD CONSTRAINT "restaurant_floors_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "restaurant_floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_current_order_id_fkey" FOREIGN KEY ("current_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_reservations" ADD CONSTRAINT "table_reservations_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifiers" ADD CONSTRAINT "menu_item_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "modifiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "restaurant_tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_number_counters" ADD CONSTRAINT "order_number_counters_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "modifiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_sales_snapshots" ADD CONSTRAINT "daily_sales_snapshots_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registered_devices" ADD CONSTRAINT "registered_devices_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "registered_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_printers" ADD CONSTRAINT "restaurant_printers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "restaurant_printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial index for active orders (listActiveOrders)
CREATE INDEX IF NOT EXISTS "orders_active_by_restaurant_opened_idx"
ON "orders" ("restaurant_id", "opened_at" DESC)
WHERE "closed_at" IS NULL;
