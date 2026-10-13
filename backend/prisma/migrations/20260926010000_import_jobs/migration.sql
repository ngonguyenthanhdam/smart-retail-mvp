CREATE TABLE "import_jobs" (
  "id" UUID NOT NULL,
  "import_type" VARCHAR(30) NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "file_hash" CHAR(64) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "total_rows" INTEGER DEFAULT 0,
  "success_rows" INTEGER DEFAULT 0,
  "failed_rows" INTEGER DEFAULT 0,
  "error_report" JSONB,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL,
  "completed_at" TIMESTAMPTZ,
  CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "import_jobs_type_check" CHECK ("import_type" IN ('PRODUCT','SALE','INVENTORY','PURCHASE','EXPENSE')),
  CONSTRAINT "import_jobs_status_check" CHECK ("status" IN ('PENDING','PROCESSING','COMPLETED','PARTIAL','FAILED')),
  CONSTRAINT "import_jobs_counts_check" CHECK ("total_rows" >= 0 AND "success_rows" >= 0 AND "failed_rows" >= 0 AND "success_rows" + "failed_rows" <= "total_rows"),
  CONSTRAINT "import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "import_jobs_import_type_file_hash_key" ON "import_jobs"("import_type", "file_hash");
ALTER TABLE "sales" ADD COLUMN "import_job_id" UUID;
ALTER TABLE "purchase_orders" ADD COLUMN "import_job_id" UUID;
ALTER TABLE "sales" ADD CONSTRAINT "sales_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "sales_import_job_id_idx" ON "sales"("import_job_id");
CREATE INDEX "purchase_orders_import_job_id_idx" ON "purchase_orders"("import_job_id");
