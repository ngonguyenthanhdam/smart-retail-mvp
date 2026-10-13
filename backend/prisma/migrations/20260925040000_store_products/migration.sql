CREATE TABLE "store_products" (
 "id" UUID NOT NULL, "location_id" UUID, "product_id" UUID,
 "selling_price" DECIMAL(14,2) NOT NULL, "safety_stock" DECIMAL(14,4) DEFAULT 0, "min_stock_level" DECIMAL(14,4) DEFAULT 0,
 "is_active" BOOLEAN DEFAULT true, "updated_at" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "store_products_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "store_products_price_check" CHECK ("selling_price" >= 0),
 CONSTRAINT "store_products_safety_check" CHECK ("safety_stock" >= 0),
 CONSTRAINT "store_products_min_check" CHECK ("min_stock_level" >= 0)
);
CREATE UNIQUE INDEX "store_products_location_id_product_id_key" ON "store_products"("location_id", "product_id");
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_products" ADD CONSTRAINT "store_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
