CREATE TABLE "inventory_lots" (
 "id" UUID NOT NULL, "location_id" UUID, "product_id" UUID, "lot_number" VARCHAR(100),
 "quantity_on_hand" DECIMAL(14,4) NOT NULL, "unit_cost" DECIMAL(14,2) NOT NULL,
 "received_date" DATE NOT NULL, "expiry_date" DATE, "purchase_order_item_id" UUID,
 "created_at" TIMESTAMPTZ(6) NOT NULL, "updated_at" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "inventory_lots_quantity_check" CHECK ("quantity_on_hand" >= 0),
 CONSTRAINT "inventory_lots_cost_check" CHECK ("unit_cost" >= 0)
);
CREATE INDEX "inventory_lots_location_id_product_id_idx" ON "inventory_lots"("location_id", "product_id");
CREATE INDEX "inventory_lots_expiry_date_idx" ON "inventory_lots"("expiry_date");
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- The purchase item FK is introduced with purchase_order_items in Phase 3.
CREATE VIEW "v_inventory_balance" AS
SELECT "location_id", "product_id", SUM("quantity_on_hand") AS "current_quantity"
FROM "inventory_lots" GROUP BY "location_id", "product_id";
