-- CreateTable
-- Existing lots retain their nullable purchase source when the FK is added below.
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "location_id" UUID,
    "status" VARCHAR(20) NOT NULL,
    "ordered_at" TIMESTAMPTZ(6) NOT NULL,
    "received_at" TIMESTAMPTZ(6),
    "total_cost" DECIMAL(14,2) DEFAULT 0,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID,
    "product_id" UUID,
    "purchase_quantity" DECIMAL(14,4) NOT NULL,
    "base_quantity" DECIMAL(14,4) NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "lot_number" VARCHAR(100),
    "expiry_date" DATE,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "location_id" UUID,
    "sold_at" TIMESTAMPTZ(6) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID,
    "product_id" UUID,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,
    "cost_of_goods_sold" DECIMAL(14,2) NOT NULL,
    "promotion_flag" BOOLEAN DEFAULT false,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "location_id" UUID,
    "expense_type" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "expense_date" DATE NOT NULL,
    "description" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_order_number_key" ON "purchase_orders"("order_number");

-- CreateIndex
CREATE INDEX "purchase_orders_location_id_ordered_at_idx" ON "purchase_orders"("location_id", "ordered_at");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_number_key" ON "sales"("invoice_number");

-- CreateIndex
CREATE INDEX "sales_location_id_sold_at_idx" ON "sales"("location_id", "sold_at");

-- CreateIndex
CREATE INDEX "sales_status_idx" ON "sales"("status");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "expenses_location_id_expense_date_idx" ON "expenses"("location_id", "expense_date");

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_purchase_order_item_id_fkey" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_values_check" CHECK ("status" IN ('DRAFT', 'RECEIVED', 'CANCELLED') AND "total_cost" >= 0);
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_values_check" CHECK ("purchase_quantity" > 0 AND "base_quantity" > 0 AND "unit_cost" >= 0 AND "line_total" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_values_check" CHECK ("status" IN ('COMPLETED', 'VOIDED') AND "subtotal" >= 0 AND "discount_amount" >= 0 AND "discount_amount" <= "subtotal" AND "total_amount" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_values_check" CHECK ("quantity" > 0 AND "unit_price" >= 0 AND "discount_amount" >= 0 AND "line_total" >= 0 AND "cost_of_goods_sold" >= 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_values_check" CHECK ("amount" >= 0 AND "expense_type" IN ('RENT', 'SALARY', 'ELECTRICITY', 'WATER', 'TRANSPORT', 'MARKETING', 'OTHER'));
