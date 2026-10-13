# Synthetic forecast integration and backtest

Date: 2026-09-27. Phase 5 Gate 3 technical demonstration.

**Synthetic/demo backtest — not evidence of real-world forecasting accuracy.**

No real RetailSense historical sales were available. This experiment checks the implemented aggregation, feature, HTTP prediction and persistence workflow using reproducible synthetic quantities. It does not establish accuracy, physical-unit calibration or business usefulness on actual CAN/PCS/KG sales. No normalization coefficient was inferred and no model was fitted or selected using this demo.

## Data and model

`backend/prisma/forecast-demo.ts`, seed **20260927**, end date **2026-09-26**:

- Three explicitly named synthetic stores; 12 products; 36 store-product configurations.
- 33 series cover **2026-06-29–2026-09-26**, 90 calendar days. Three new-product series cover 14 days and remain insufficient for forecasting.
- 264 historical invoices: 261 COMPLETED and three VOIDED; 2,652 sale-item rows. Three VOIDED lines are excluded from all demand queries.
- 363 observed zero-sale pair-days; no zero-quantity invoice lines are fabricated. Weekly effects, a modest deterministic trend and seeded variation generate high/low quantities. CAN/PCS lines use integer sales; KG lines use two-decimal quantities, stored in the application's four-decimal base-quantity field.
- Seed content SHA-256: `87f3e927345919a18561fa86ac6295014a8af4e23414a9d674f951e0ca00a440`. Repeating the same end date preserves records and edits; conflicting seeds are rejected. Historical demo invoices link to a dedicated labelled import job and never change inventory.

Selected Gate 2 model: **LightGBM**, `freshretail-demand-v1-lightgbm`. Artifact SHA-256 remains `1823f5f9cf6be1086819db79ad40a5cf6b0c5dbb913367f7b9acaf8d911033b0`. The original artifact, metadata, experiment and benchmark results are unchanged. Gate 2 final-test **WAPE 34.17%, MAE 0.407719 and RMSE 0.690328** describe normalized FreshRetailNet `sale_amount` only.

Features remain lags 1/7/14/30, strictly prior rolling means 7/14/30, weekday and month. Demo base quantities are used as numerical lag/rolling inputs directly. The resulting numerical output is an **uncalibrated experimental estimate** labelled with the input product's demo base unit. A matching unit label is not evidence of transfer accuracy. No arbitrary rescaling, demo-driven retraining or artifact replacement occurs.

## Historical experiment

The reproducible command `npm run forecast:backtest` from `backend/` reads PostgreSQL with the same `ForecastHistory` and `seriesAt` helpers used by forecast runs, then calls the actual FastAPI `/predict` endpoint. FastAPI has no database connection. Source observations are summed by Store × Product × Vietnam business date from COMPLETED invoices. Within covered eligible series, no-sale dates become zeros; VOIDED and dates after the cutoff are excluded from inputs.

| Horizon | Origin | Actual target dates | Available prior coverage | Input days | Tested / skipped pairs |
| --- | --- | --- | ---: | ---: | ---: |
| 7 days | 2026-09-19 | 2026-09-20–2026-09-26 | 83 days | 30 | 33 / 3 |
| 30 days | 2026-08-27 | 2026-08-28–2026-09-26 | 60 days | 30 | 33 / 3 |

Every multi-step forecast uses earlier predictions, not held-out actuals. No target-period actual quantity is sent to FastAPI. There is one origin per horizon and overlapping target windows; these are not independent scientific benchmarks. The three short-history pairs are reported as insufficient, not filled backward with fabricated data.

Metrics are computed separately by base unit to avoid mixing CAN, KG and PCS in MAE/RMSE. WAPE is sum of absolute errors divided by sum of actual quantity, undefined for an all-zero denominator. MAE/RMSE use daily demo quantities.

| Horizon | Unit | Series | Daily rows | WAPE | MAE | RMSE |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 7 days | CAN | 9 | 63 | 34.8660% | 4.100906 | 6.123776 |
| 7 days | KG | 9 | 63 | 31.1705% | 0.898948 | 1.245601 |
| 7 days | PCS | 15 | 105 | 36.1758% | 4.706298 | 6.544146 |
| 30 days | CAN | 9 | 270 | 36.5552% | 4.107719 | 6.249670 |
| 30 days | KG | 9 | 270 | 37.8225% | 1.051857 | 1.397926 |
| 30 days | PCS | 15 | 450 | 39.3821% | 4.799363 | 6.517952 |

Errors are substantial even on this constructed dataset. No acceptance threshold, tuning or accuracy claim is derived from these values. Zero negative predictions required clipping in these two demo backtests; the adapter still applies the retained model's `max(0, prediction)` rule during recursion. Exact per-unit totals, dates and actual/predicted examples are retained in [retailsense_demo_backtest.json](retailsense_demo_backtest.json). Independent NumPy/scikit-learn calculations reproduced all six metric groups within 1e-10.

## Integrated behavior

FastAPI loads the saved artifact once, validates keys/dates/quantities and returns daily results. The 90-day planning path chains three existing 30-day recursive calls; each later block uses only previous predictions. Seven/30-day benchmark behavior and model weights are preserved. Ninety days has no accuracy validation.

NestJS enforces source eligibility, role and store scope. ADMIN may run 30/90-day forecasts globally or for one store. Managers have own-store read-only access, including filtered contents of global runs. STAFF cannot access forecast endpoints or the page. This release accepts fully marked synthetic histories only; it is not a production transfer approval for real sales.

`forecast_runs` records version, horizon, timestamps, status and demo/source metadata. `demand_forecasts` stores per-store/product period quantities and price snapshots. Quantity is rounded HALF_UP to four decimals; revenue equals that **stored** quantity times the captured store price, rounded HALF_UP to two decimals. Failed prediction/validation/persistence produces a FAILED run and no forecast rows. Interrupted synchronous runs are failed on backend restart; the MVP assumes one backend instance.

The English Forecast UI displays the synthetic limitation, run status, period, model version, store/product/base unit, estimated quantity, price and revenue. It distinguishes 90-day planning estimates and explains insufficient history. It has no training, replenishment, recommendation-decision or forecast-alert workflow.

## Verification and limits

- 28 Python tests passed, including seven new tests exercising real HTTP prediction, model integrity, 30/90-day recursion, determinism, malformed/future inputs, insufficient history, clipping and sanitized failures.
- 196 backend tests passed, including 12 forecast checks and all 184 prior regression checks. Coverage includes source aggregation, Vietnam date boundaries, zero/short histories, synthetic seed idempotency, inactive configurations, future-target isolation, cross-store access, response validation, exact revenue and transaction rollback.
- Frontend lint/typecheck and production build passed. Nine production Chrome checks passed on desktop/mobile across ADMIN, manager and STAFF, with no JavaScript/console errors and full fixture cleanup. Six application smoke groups passed with the actual model service; two global demo runs and 66 forecasts were retained, while sales and inventory stayed unchanged.
- Both windows use a small, deterministic, artificial sample. There is no independent real RetailSense holdout, no validated physical-unit conversion and no real-world accuracy conclusion. The original normalized artifact metadata continues to declare `operational_units_supported=false`.

Gate 3 is a technical synthetic demonstration under the revised scope. Real forecasting validation remains a limitation of the graduation project. Replenishment and forecast-based business decisions belong to the later Gate 4 review.
