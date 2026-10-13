CREATE TABLE "forecast_runs" (
  "id" UUID NOT NULL PRIMARY KEY,
  "model_version" VARCHAR(100) NOT NULL,
  "algorithm" VARCHAR(100) NOT NULL,
  "horizon_months" SMALLINT NOT NULL CHECK ("horizon_months" IN (1,3)),
  "metrics" JSONB,
  "status" VARCHAR(20) NOT NULL CHECK ("status" IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  "requested_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "started_at" TIMESTAMPTZ NOT NULL,
  "completed_at" TIMESTAMPTZ
);
CREATE TABLE "demand_forecasts" (
  "id" UUID NOT NULL PRIMARY KEY,
  "forecast_run_id" UUID NOT NULL REFERENCES "forecast_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "location_id" UUID NOT NULL REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL CHECK ("period_end" >= "period_start"),
  "predicted_quantity" NUMERIC(14,4) NOT NULL CHECK ("predicted_quantity" >= 0),
  "estimated_unit_price" NUMERIC(14,2) NOT NULL CHECK ("estimated_unit_price" >= 0),
  "predicted_revenue" NUMERIC(14,2) NOT NULL CHECK ("predicted_revenue" >= 0),
  "actual_quantity" NUMERIC(14,4),
  "actual_revenue" NUMERIC(14,2),
  "forecast_error" NUMERIC(14,4),
  "created_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "demand_forecasts_grain_key" UNIQUE ("forecast_run_id","location_id","product_id","period_start","period_end")
);
CREATE INDEX "demand_forecasts_location_id_product_id_period_start_idx" ON "demand_forecasts"("location_id","product_id","period_start");
CREATE INDEX "demand_forecasts_forecast_run_id_idx" ON "demand_forecasts"("forecast_run_id");
