CREATE TABLE "replenishment_recommendations" (
 "id" UUID NOT NULL PRIMARY KEY,
 "demand_forecast_id" UUID NOT NULL UNIQUE REFERENCES "demand_forecasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "location_id" UUID NOT NULL REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "current_stock_snapshot" NUMERIC(14,4) NOT NULL CHECK (current_stock_snapshot >= 0),
 "incoming_stock_snapshot" NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (incoming_stock_snapshot >= 0),
 "safety_stock_snapshot" NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (safety_stock_snapshot >= 0),
 "recommended_quantity" NUMERIC(14,4) NOT NULL CHECK (recommended_quantity >= 0),
 "manager_quantity" NUMERIC(14,4) CHECK (manager_quantity >= 0),
 "decision_status" VARCHAR(20) NOT NULL CHECK (decision_status IN ('PENDING','ACCEPTED','ADJUSTED','REJECTED')),
 "decided_by" UUID REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "decided_at" TIMESTAMPTZ,
 "decision_note" TEXT,
 CHECK (decision_status <> 'ADJUSTED' OR (manager_quantity IS NOT NULL AND length(trim(decision_note)) > 0 AND decision_note IS NOT NULL)),
 CHECK ((decision_status = 'PENDING' AND decided_by IS NULL AND decided_at IS NULL) OR (decision_status <> 'PENDING' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX "replenishment_recommendations_location_id_decision_status_idx" ON "replenishment_recommendations"("location_id","decision_status");
ALTER TABLE "purchase_orders" ADD COLUMN "replenishment_recommendation_id" UUID;
CREATE UNIQUE INDEX "purchase_orders_replenishment_recommendation_id_key" ON "purchase_orders"("replenishment_recommendation_id");
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_replenishment_recommendation_id_fkey" FOREIGN KEY ("replenishment_recommendation_id") REFERENCES "replenishment_recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "inventory_alerts" (
 "id" UUID NOT NULL PRIMARY KEY,
 "location_id" UUID NOT NULL REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "demand_forecast_id" UUID REFERENCES "demand_forecasts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "inventory_lot_id" UUID REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "alert_type" VARCHAR(30) NOT NULL CHECK (alert_type IN ('STOCKOUT_RISK','OVERSTOCK_RISK','EXPIRY_RISK')),
 "severity" VARCHAR(20) NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
 "message" TEXT NOT NULL,
 "status" VARCHAR(20) NOT NULL CHECK (status IN ('OPEN','RESOLVED')),
 "detected_at" TIMESTAMPTZ NOT NULL,
 "resolved_at" TIMESTAMPTZ,
 CONSTRAINT "inventory_alerts_location_id_product_id_alert_type_key" UNIQUE (location_id,product_id,alert_type)
);
CREATE INDEX "inventory_alerts_location_id_status_alert_type_idx" ON "inventory_alerts"(location_id,status,alert_type);
