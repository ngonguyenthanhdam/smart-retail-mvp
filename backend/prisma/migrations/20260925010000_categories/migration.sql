CREATE TABLE "categories" (
  "id" UUID NOT NULL,
  "parent_id" UUID,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "external_source" VARCHAR(50),
  "external_id" VARCHAR(100),
  "is_active" BOOLEAN DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
