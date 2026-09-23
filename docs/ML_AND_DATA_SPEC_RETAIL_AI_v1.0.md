# ML_AND_DATA_SPEC_RETAIL_AI_v1.0

> **Project:** RetailSense AI  
> **Purpose:** Source of truth for Machine Learning and data usage in MVP  
> **Status:** LOCKED FOR MVP  
> **Related documents:** `PROJECT_MASTER_RETAIL_AI_v1.0.md`, `DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md`, `PROJECT_STATE.md`

---

# 1. ML Goal

The Machine Learning scope is intentionally narrow and focused.

Primary problem:

```text
Demand Forecasting
```

Prediction unit:

```text
Store × Product × Forecast Period
```

Required forecast horizons:

```text
1 month
3 months
```

Primary ML output:

```text
predicted_quantity
```

Example:

```text
Store A
Product P001
Next month
→ Predicted demand = 420 units
```

The ML model does **not** directly decide purchase quantity.

Replenishment quantity is calculated later by Backend business logic.

---

# 2. Primary Dataset

Primary public dataset:

```text
FreshRetailNet-50K
```

The dataset is used for:

```text
training
validation
testing
model comparison
demand forecasting experiments
```

It is **not** the operational PostgreSQL schema.

The original raw dataset must remain unchanged.

---

# 3. Available FreshRetailNet Fields

Expected fields:

```text
city_id
store_id
management_group_id
first_category_id
second_category_id
third_category_id
product_id
dt
sale_amount
hours_sale
stock_hour6_22_cnt
hours_stock_status
discount
holiday_flag
activity_flag
precpt
avg_temperature
avg_humidity
avg_wind_level
```

The project does not need to use every field.

---

# 4. Model v1 Fields

## 4.1 Identifiers

```text
store_id
product_id
```

These identify the Store × Product pair.

## 4.2 Time

Raw field:

```text
dt
```

Derived features:

```text
day_of_week
week_of_year
month
```

Optional:

```text
is_weekend
```

## 4.3 Historical demand

Raw demand history:

```text
sale_amount
```

Lag features:

```text
lag_1
lag_7
lag_14
lag_30
```

Rolling features:

```text
rolling_mean_7
rolling_mean_14
rolling_mean_30
```

Optional if experiments show value:

```text
rolling_std_7
rolling_std_30
```

## 4.4 Business/context features

Use:

```text
discount
holiday_flag
activity_flag
stock_hour6_22_cnt
```

## 4.5 Weather/context features

Use:

```text
precpt
avg_temperature
avg_humidity
avg_wind_level
```

These are contextual features and may be removed later if validation shows no benefit.

---

# 5. Fields Excluded From Model v1

Do not use initially:

```text
hours_sale
hours_stock_status
management_group_id
```

Reason:

- sequence fields add unnecessary preprocessing complexity;
- they are not required to prove the main forecasting workflow;
- the MVP should remain manageable.

They may be added only after Model v1 is stable.

---

# 6. Target Variable

Primary target:

```text
sale_amount
```

Meaning:

```text
quantity sold for one Store × Product × Date
```

The model may predict at daily granularity and aggregate daily predictions to the requested 1-month or 3-month business horizon.

Future target values must never be used as model inputs.

---

# 7. ML Data Grain

Base modeling grain:

```text
Store × Product × Date
```

Example:

```text
store_id    = 105
product_id  = 4821
dt          = 2026-01-10
sale_amount = 18
```

Forecast results are later aggregated into:

```text
1 month
or
3 months
```

---

# 8. Data Cleaning Rules

Before feature engineering:

```text
1. Parse dt into date/datetime.
2. Sort by store_id, product_id, dt.
3. Remove exact duplicate rows if present.
4. Validate sale_amount.
5. Handle missing values with documented rules.
6. Validate numeric columns.
7. Ensure lag/rolling features use past data only.
```

## 8.1 Missing values

MVP rule:

```text
sale_amount:
Do not silently invent demand values.

weather/context numeric fields:
Use a simple documented strategy such as median fill or forward fill where reasonable.

flags:
Preserve valid 0/1 semantics.
```

The final chosen strategy must be updated in this document after EDA.

## 8.2 Invalid demand values

Unexpected negative `sale_amount` values must be investigated before training.

The preprocessing pipeline should report how many rows were removed or corrected.

---

# 9. Feature Engineering Pipeline

```text
Raw FreshRetailNet
       ↓
Parse Date
       ↓
Sort by Store + Product + Date
       ↓
Create Calendar Features
       ↓
Create Lag Features
       ↓
Create Rolling Features
       ↓
Select Context Features
       ↓
Drop Rows Without Required Lag History
       ↓
Training Dataset
```

## 9.1 Lag rule

For a Store × Product pair:

```text
lag_1  = previous day's sale_amount
lag_7  = sale_amount 7 days earlier
lag_14 = sale_amount 14 days earlier
lag_30 = sale_amount 30 days earlier
```

No lag may read a future row.

## 9.2 Rolling rule

Example:

```text
rolling_mean_7
```

must use previous observations only.

Do not leak the current/future target into rolling features.

---

# 10. Train / Validation / Test Split

Because this is forecasting, random splitting is forbidden.

Do not use:

```text
random train_test_split
```

Use chronological splitting:

```text
Oldest period  → TRAIN
Middle period  → VALIDATION
Newest period  → TEST
```

Initial recommended proportion if the date range allows:

```text
Train      ≈ 70%
Validation ≈ 15%
Test       ≈ 15%
```

Exact dates must be selected after inspecting the real dataset and then written into this document.

---

# 11. Optional Backtesting

If time allows, use simple walk-forward evaluation:

```text
Window 1: Train → Validate
Window 2: Expanded Train → Validate
Window 3: Expanded Train → Validate
```

Backtesting is recommended but not mandatory for the first working MVP.

A correct chronological split is enough for Model v1.

---

# 12. Models

## 12.1 Baseline

At least one baseline is mandatory.

Recommended:

```text
Naive Forecast
```

or:

```text
Moving Average
```

Purpose:

```text
prove that the selected ML model improves over a simple method
```

## 12.2 Candidate ML models

Candidates:

```text
Random Forest
XGBoost
LightGBM
```

Minimum recommended experiment:

```text
Baseline
+
Random Forest or XGBoost
+
LightGBM
```

Deep Learning is not required for MVP.

---

# 13. Model Selection Rule

Choose the deployed model using measured validation/test performance.

Do not choose a model because it:

```text
sounds more advanced
is newer
uses Deep Learning
```

A simpler model is acceptable if it performs better and is easier to deploy/explain.

---

# 14. Evaluation Metrics

Required:

```text
MAE
RMSE
WAPE
```

## MAE

Measures average absolute error.

## RMSE

Penalizes larger errors more strongly.

## WAPE

Useful for overall business-level forecasting error.

All compared models should be evaluated using the same split and metrics.

---

# 15. Model Comparison Output

The final report should contain a table similar to:

```text
Model             MAE       RMSE      WAPE
------------------------------------------------
Naive             ...       ...       ...
Random Forest     ...       ...       ...
LightGBM          ...       ...       ...
```

Actual metric values must come from experiments.

Never invent evaluation results.

---

# 16. Model Artifact

After final training, keep one deployable model artifact.

Recommended structure:

```text
ml-service/
│
├── models/
│   └── demand_model_v1.*
│
├── src/
│   ├── preprocessing.py
│   ├── features.py
│   ├── train.py
│   ├── evaluate.py
│   └── predict.py
│
└── app.py
```

Possible artifact formats:

```text
.joblib
.pkl
native LightGBM/XGBoost format
```

Avoid keeping many obsolete model binaries.

---

# 17. Training Workflow

Training is offline:

```text
FreshRetailNet
       ↓
Load Data
       ↓
Clean Data
       ↓
Feature Engineering
       ↓
Chronological Split
       ↓
Train Baseline
       ↓
Train Candidate Models
       ↓
Evaluate
       ↓
Select Best Model
       ↓
Train Final Model
       ↓
Save Artifact
```

Training is not triggered by normal website users.

---

# 18. Inference Workflow

```text
Admin
  ↓
Run Forecast
  ↓
NestJS Backend
  ↓
FastAPI ML Service
  ↓
Load saved model
  ↓
Build inference features
  ↓
Predict demand
  ↓
Return predictions
  ↓
NestJS
  ↓
Save demand_forecasts
```

The ML Service returns predictions only.

Business decisions remain in NestJS.

---

# 19. ML Service Responsibility

FastAPI is responsible for:

```text
loading model artifact
inference preprocessing
feature preparation required for prediction
running inference
returning demand prediction
```

FastAPI is not responsible for:

```text
authentication
authorization
purchase creation
inventory changes
replenishment calculation
alerts
financial calculations
```

Those belong to NestJS Backend.

---

# 20. ML → Backend Output Contract

Conceptual response:

```json
{
  "modelVersion": "demand-lightgbm-v1",
  "forecastHorizonMonths": 1,
  "predictions": [
    {
      "externalStoreId": "105",
      "externalProductId": "4821",
      "periodStart": "2026-10-01",
      "periodEnd": "2026-10-31",
      "predictedQuantity": 420.5
    }
  ]
}
```

Exact API naming may be refined during Backend implementation, but semantic output must contain:

```text
Store
Product
Forecast Period
Predicted Quantity
Model Version
```

---

# 21. Mapping to Application Database

FreshRetailNet IDs map to application master data using:

```text
locations.external_source
locations.external_id

products.external_source
products.external_id
```

Example:

```text
locations.external_source = FRESH_RETAIL
locations.external_id     = 105
```

```text
products.external_source = FRESH_RETAIL
products.external_id     = 4821
```

Internal PostgreSQL UUIDs remain the real application primary keys.

Do not change application PKs to match FreshRetail integer IDs.

---

# 22. Friendly Demo Names

FreshRetailNet entities may be anonymized.

For UI demo, simulated display names are allowed.

Example:

```text
Store 105 → MiniMart – Area A
Product 4821 → Green Mustard
```

These are display/demo metadata only.

Do not claim that they are the original real-world identities in FreshRetailNet.

---

# 23. Website Data vs ML Dataset

The project intentionally uses two different data sources.

## FreshRetailNet

Used for:

```text
ML training
ML validation
ML testing
forecast experiments
```

## PostgreSQL Application Data

Used for:

```text
users
stores
products
inventory
purchases
sales
expenses
forecast results
recommendations
alerts
dashboard
```

Their schemas do not need to match.

This is expected and correct.

---

# 24. Demo / Simulated Operational Data

Some operational data may be simulated for website demonstration:

```text
purchase orders
expenses
inventory lots
expiry dates
friendly product names
friendly store names
```

Such data must be described as simulated/demo data.

It must not be presented as original FreshRetailNet ground truth.

---

# 25. Retraining

Automatic retraining is not part of MVP.

Possible future flow:

```text
Website accumulates new sales
→ export v_sales_daily_facts
→ retrain offline
→ evaluate
→ deploy new model version
```

This is future work only.

---

# 26. Revenue Forecast

ML predicts:

```text
predicted_quantity
```

NestJS calculates:

```text
predicted_revenue
=
predicted_quantity × estimated selling price
```

No separate revenue model is required.

---

# 27. Replenishment Boundary

ML does not return order quantity.

NestJS calculates:

```text
Recommended Quantity
=
MAX(
    0,
    Predicted Demand
    + Safety Stock
    - Current Stock
    - Incoming Stock
)
```

This separation is mandatory.

---

# 28. Inventory Alert Boundary

Forecast may contribute to alert creation.

Example:

```text
Predicted Demand
>
Current Stock + Incoming Stock
```

may create:

```text
STOCKOUT_RISK
```

Overstock/expiry thresholds remain Backend business rules, not ML logic.

---

# 29. Git / Data Rules

Git stores:

```text
source code
preprocessing code
feature-engineering code
training code
evaluation code
configuration
documentation
small sample data only when necessary
```

Git must not store large raw/generated datasets.

Ignore:

```text
data/raw/
data/processed/
large .csv/.parquet files
temporary exports
training cache
```

Do not commit the full FreshRetailNet dataset.

---

# 30. Model Files and Git

Do not accumulate many artifacts such as:

```text
model_v1
model_v2
model_final
model_final2
model_really_final
```

For MVP, keep only the final deployable artifact if its size is reasonable.

If large, document how to regenerate it instead of bloating Git history.

---

# 31. Reproducibility

Training should preserve enough information to reproduce the final experiment.

Recommended:

```text
fixed random seed
saved model configuration
saved feature list
saved metrics
documented train/validation/test dates
```

The project should be able to explain:

```text
which dataset
which features
which split
which model
which parameters
which metrics
```

produced the final model.

---

# 32. Minimum ML Deliverables

ML is considered complete when the project has:

```text
1. FreshRetailNet loading code.
2. Data cleaning/preprocessing.
3. Feature engineering.
4. Chronological train/validation/test split.
5. At least one baseline.
6. At least one ML model.
7. Model comparison.
8. MAE/RMSE/WAPE results.
9. Final saved model.
10. FastAPI inference endpoint.
11. NestJS integration.
12. Forecast saved into demand_forecasts.
```

---

# 33. Explicitly Not Required in MVP

```text
Deep Learning
LSTM
GRU
Transformer forecasting
Feature Store
Data Warehouse
Staging Database
Kafka
Streaming ML
Online Learning
Automatic Retraining
MLOps platform
Model registry platform
Explainable AI dashboard
Real-time per-minute prediction
Customer-level prediction
Recommendation engine
```

AI must not add these automatically.

---

# 34. Final Locked Decisions

```text
Dataset:
FreshRetailNet-50K

Primary problem:
Demand Forecasting

Prediction grain:
Store × Product

Raw target:
sale_amount

Forecast horizons:
1 month
3 months

Training:
Offline

Inference service:
FastAPI

Business orchestration:
NestJS

Split:
Chronological

Metrics:
MAE
RMSE
WAPE

Baseline:
Naive or Moving Average

Candidate ML:
Random Forest
XGBoost
LightGBM

Revenue forecast:
Demand × Estimated Price

Replenishment:
Backend business rule

Automatic retraining:
Not MVP

Deep Learning:
Not required

Full raw datasets in Git:
Forbidden
```

---

# 35. Items Finalized Only After Initial EDA

The following must not be guessed before inspecting the actual dataset:

```text
Exact train date range
Exact validation date range
Exact test date range
Final missing-value strategy
Final feature subset
Final selected model
Final hyperparameters
Final metric values
```

After EDA/model experiments, update this document with final decisions.

---

# 36. AI Source-of-Truth Rule

For ML/data tasks, AI must read:

```text
PROJECT_MASTER_RETAIL_AI_v1.0.md
ML_AND_DATA_SPEC_RETAIL_AI_v1.0.md
PROJECT_STATE.md
```

For application DB integration also read:

```text
DATABASE_SPEC_RETAIL_AI_v1.1_MVP.md
```

If implementation conflicts with this spec:

```text
STOP
REPORT THE CONFLICT
DO NOT SILENTLY CHANGE THE DESIGN
```

---

# 37. Document Status

```text
Version:
ML_AND_DATA_SPEC v1.0

Status:
LOCKED FOR MVP
```

This document is the source of truth for:

```text
dataset usage
preprocessing
feature engineering
train/validation/test strategy
model candidates
evaluation metrics
inference output
ML/backend responsibility boundary
Git/data rules
```
