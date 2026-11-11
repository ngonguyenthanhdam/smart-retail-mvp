-- Additive only: legacy prices remain unknown until an administrator supplies them.
ALTER TABLE "products"
  ADD COLUMN "image_path" VARCHAR(500),
  ADD COLUMN "default_selling_price" DECIMAL(14,2),
  ADD COLUMN "default_min_stock_level" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "default_safety_stock" DECIMAL(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN "is_global_all_stores" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT "products_default_price_positive" CHECK ("default_selling_price" IS NULL OR "default_selling_price" > 0),
  ADD CONSTRAINT "products_default_stock_nonnegative" CHECK ("default_min_stock_level" >= 0 AND "default_safety_stock" >= 0),
  ADD CONSTRAINT "products_global_price_required" CHECK (NOT "is_global_all_stores" OR "default_selling_price" > 0 AND "default_selling_price" IS NOT NULL);
