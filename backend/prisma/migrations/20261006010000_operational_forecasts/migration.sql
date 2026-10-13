ALTER TABLE "products" ADD COLUMN "image_key" VARCHAR(100);
ALTER TABLE "units" ADD COLUMN "allow_fraction" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sales" ADD COLUMN "client_request_id" VARCHAR(100), ADD COLUMN "request_hash" CHAR(64);
CREATE UNIQUE INDEX "sales_client_request_id_key" ON "sales"("client_request_id");
ALTER TABLE "forecast_runs" ADD COLUMN "daily_predictions" JSONB;
ALTER TABLE "replenishment_recommendations"
  ADD COLUMN "demand_quantity_snapshot" DECIMAL(14,4),
  ADD COLUMN "demand_period_start" DATE,
  ADD COLUMN "demand_period_end" DATE;
CREATE TABLE "sales_history_coverage" (
  "id" UUID NOT NULL,
  "location_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "source" VARCHAR(30) NOT NULL,
  "note" VARCHAR(500) NOT NULL,
  "confirmed_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_history_coverage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_history_coverage_period_check" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "sales_history_coverage_source_check" CHECK ("source" IN ('STORE_HISTORY', 'SYNTHETIC'))
);
CREATE UNIQUE INDEX "sales_history_coverage_location_id_product_id_period_start_pe_key" ON "sales_history_coverage"("location_id", "product_id", "period_start", "period_end");
CREATE INDEX "sales_history_coverage_location_id_product_id_period_end_idx" ON "sales_history_coverage"("location_id", "product_id", "period_end");
-- Only the known deterministic fixture proves complete daily coverage, including zero-sale days.
-- No imported real-store file is assumed complete automatically.
INSERT INTO "sales_history_coverage" ("id", "location_id", "product_id", "period_start", "period_end", "source", "note", "confirmed_by")
SELECT gen_random_uuid(), s.location_id, i.product_id,
       MIN((s.sold_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
       substring(j.file_name FROM '([0-9]{4}-[0-9]{2}-[0-9]{2})')::date,
       'SYNTHETIC', 'Deterministic sample history; coverage verified by its seed manifest.', j.created_by
FROM sales s JOIN sale_items i ON i.sale_id=s.id JOIN import_jobs j ON j.id=s.import_job_id
JOIN products p ON p.id=i.product_id JOIN locations l ON l.id=s.location_id
WHERE j.id='d5202600-0000-4000-8000-000000000900' AND j.status='COMPLETED'
 AND j.file_name ~ '^SYNTHETIC_forecast_v1_[0-9]{4}-[0-9]{2}-[0-9]{2}\.seed$'
 AND s.status='COMPLETED' AND p.external_source='RETAILSENSE_SYNTHETIC_V1' AND l.external_source='RETAILSENSE_SYNTHETIC_V1'
GROUP BY s.location_id, i.product_id, j.file_name, j.created_by;
