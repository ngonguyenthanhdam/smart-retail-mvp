CREATE TABLE "products" (
 "id" UUID NOT NULL, "sku" VARCHAR(50) NOT NULL, "barcode" VARCHAR(100), "name" VARCHAR(200) NOT NULL,
 "category_id" UUID, "base_unit_id" UUID, "purchase_unit_id" UUID,
 "purchase_to_base_ratio" DECIMAL(14,4) DEFAULT 1, "default_cost" DECIMAL(14,2) DEFAULT 0,
 "track_expiry" BOOLEAN DEFAULT false, "shelf_life_days" INTEGER,
 "external_source" VARCHAR(50), "external_id" VARCHAR(100), "is_active" BOOLEAN DEFAULT true,
 "created_at" TIMESTAMPTZ(6) NOT NULL, "updated_at" TIMESTAMPTZ(6) NOT NULL, "deleted_at" TIMESTAMPTZ(6),
 CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "products_ratio_check" CHECK ("purchase_to_base_ratio" > 0),
 CONSTRAINT "products_cost_check" CHECK ("default_cost" >= 0),
 CONSTRAINT "products_shelf_life_check" CHECK ("shelf_life_days" IS NULL OR "shelf_life_days" >= 0)
);
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");
CREATE INDEX "products_category_id_idx" ON "products"("category_id");
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_purchase_unit_id_fkey" FOREIGN KEY ("purchase_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
