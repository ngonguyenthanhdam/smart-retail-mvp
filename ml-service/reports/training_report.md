# Demand forecasting: model comparison

Date: 2026-09-26. Phase 5, Gate 2. **Selected benchmark model: LightGBM**, version `freshretail-demand-v1-lightgbm`. Training/evaluation are complete; web integration awaits review.

## Data and experiment

The experiment uses all 50,000 Store × Product series from the pinned [FreshRetailNet-50K release](https://huggingface.co/datasets/Dingdong-Inc/FreshRetailNet-50K/tree/08c1fab7f9257bc73679d415d65d644165d351d4). The [EDA report](eda_report.md) describes the 4.85 million observations and cleaning rules. No sample replacement, extra dataset or operational PostgreSQL data was used.

**Target scale:** published normalized `sale_amount`, with no additional target transformation, relative-demand scaling or conversion to CAN/KG/PCS. Both models use the same observations and score against the same normalized actuals. Stockout days and zero sales remain included. No separate revenue model exists.

| Stage | Available history / fitting targets | Forecast targets | Target rows |
| --- | --- | --- | ---: |
| Initial LightGBM fit | History from 2024-03-28; eligible targets 2024-04-27–2024-05-26 | None | 1,500,000 fitting rows |
| Primary validation, 7 days | Forecast origin 2024-05-26 | 2024-05-27–2024-06-02 | 350,000 |
| Supplementary validation, 30 days | Same origin, 2024-05-26 | 2024-05-27–2024-06-25 | 1,500,000 |
| Frozen-configuration LightGBM refit | Eligible targets 2024-04-27–2024-06-25 | None | 3,000,000 fitting rows |
| Final test, 7 days | Forecast origin 2024-06-25 | 2024-06-26–2024-07-02 | 350,000 |

This preserves the approved 60-day initial training history, 30-day validation and seven-day final test. Each forecast is made once at its origin. Later horizons recursively use the model's own earlier predictions, never actual sales from the target period. The first seven days of the 30-day validation forecast provide the primary validation score. Their overlap is intentional; these are not independent validation samples.

The comparison protocol was committed at `8d2ef594efddf4b2021fe402f48ebdfedde46d2c` before the run. [experiment.json](../experiment.json) specifies the feature order, dates, parameters and selection rule. [model_selection.json](model_selection.json) records the LightGBM choice before test evaluation. There was one real-data experiment, one LightGBM configuration and no test-driven tuning.

## Models and features

**Seasonal Naive:** repeat each series' last observed seven-day pattern. It needs no fitted parameters.

**LightGBM:** 200 trees; 31 leaves; learning rate 0.05; minimum 100 observations per leaf; L1 regression objective; four CPU threads; fixed seed 20260926; deterministic column-wise training. No hyperparameter search or early stopping was used. The L1 objective was chosen before evaluation because WAPE and MAE use absolute errors. The same configuration was used for both fits. See [LightGBM's parameter documentation](https://lightgbm.readthedocs.io/en/v4.6.0/Parameters.html) for parameter semantics.

Nine inputs: `lag_1`, `lag_7`, `lag_14`, `lag_30`, `rolling_mean_7`, `rolling_mean_14`, `rolling_mean_30`, `day_of_week`, `month`. Store/product identifiers group observations but are never passed as model features. Weather, promotion, holiday, activity, category/anonymous IDs and stockout information are excluded from prediction inputs.

All forecasts require 30 complete consecutive prior days. Missing days/values, duplicate keys, future observations in history, invalid horizons and nonfinite output are rejected. Negative LightGBM output is clipped to zero before it enters the next recursive step: 31 values in the 1.5-million-row 30-day validation forecast and 69 in the 350,000-row test forecast. No quantities are rounded to integer units.

## Main comparison: daily forecast errors

WAPE is `sum(abs(actual - predicted)) / sum(actual)`, displayed as a percentage; it is undefined for an all-zero actual denominator. MAE and RMSE are in the source's normalized daily-sales scale. These are pooled daily errors over the exact same Store × Product × Day keys.

| Evaluation | Model | WAPE | MAE | RMSE |
| --- | --- | ---: | ---: | ---: |
| Validation, 7 days | Seasonal Naive | 40.3917% | 0.425872 | 0.719930 |
| Validation, 7 days | **LightGBM** | **32.5978%** | **0.343697** | **0.591147** |
| Validation, 30 days | Seasonal Naive | 45.9987% | 0.496643 | 0.847429 |
| Validation, 30 days | **LightGBM** | **39.2972%** | **0.424289** | **0.743919** |
| Final test, 7 days | Seasonal Naive | 41.8314% | 0.499071 | 0.835819 |
| Final test, 7 days | **LightGBM** | **34.1745%** | **0.407719** | **0.690328** |

Selection used seven-day validation WAPE, with MAE/RMSE as tie-breaks and a final preference for the simpler baseline. LightGBM won before the test was evaluated. Final test WAPE improves by **7.6569 percentage points**, or **18.30% relative**, versus Seasonal Naive. Test results support that selection but were not used to change it.

The retained LightGBM artifact is the unchanged configuration refitted through June 25. Validation scores describe the initial fit; test scores describe the refitted model. It was not fitted to the test targets. The final test does not independently validate a 30-day horizon.

## Planning totals and stockout diagnostics

For period totals, sum each pair's daily actuals and forecasts first, then compute metrics over 50,000 pairs. This is a different task from the primary daily metric; daily errors can cancel within a period.

| Evaluation | Model | Total-period WAPE | Total-period MAE | Total-period RMSE |
| --- | --- | ---: | ---: | ---: |
| Validation, 7 days | Seasonal Naive | 17.6713% | 1.304228 | **2.253668** |
| Validation, 7 days | LightGBM | **17.4624%** | **1.288811** | 2.320486 |
| Validation, 30 days | Seasonal Naive | 22.5155% | 7.292944 | **12.665817** |
| Validation, 30 days | LightGBM | **22.2137%** | **7.195161** | 13.506192 |
| Final test, 7 days | Seasonal Naive | 20.0061% | 1.670782 | **2.713761** |
| Final test, 7 days | LightGBM | **19.3683%** | **1.617519** | 2.745331 |

**The large daily-error improvement does not carry over equally to period totals.** LightGBM's total-period WAPE/MAE improve only modestly, and its total-period RMSE is worse than the baseline in every evaluated window. Some larger accumulated errors remain. This limits conclusions about replenishment quality; the benchmark does not establish better purchase decisions.

On the final test, LightGBM predicts aggregate normalized sales of 408,419.0984 against 417,568.5230 observed, about **2.19% below** actuals. Seasonal Naive's aggregate total is closer, but this alone hides errors that cancel between series/dates.

| Test target slice | Rows | Seasonal Naive WAPE | LightGBM WAPE |
| --- | ---: | ---: | ---: |
| No recorded daytime stockout | 206,562 | 38.9090% | 30.7536% |
| Some daytime stockout | 143,438 | 46.4405% | 39.5696% |

Stockout status is joined only after prediction for these diagnostics. The target remains observed sales; neither model recovers demand lost while unavailable. Per-date metrics and all diagnostic slices are in [training_results.json](training_results.json).

## Saved artifact and reproduction

Only the selected model is retained:

- [demand_model.joblib](../models/demand_model.joblib): **215,015 bytes**; version `freshretail-demand-v1-lightgbm`.
- [model_metadata.json](../models/model_metadata.json): target scale, feature order, package versions, fit dates, parameters, metrics, dataset revision and source/config hashes.
- SHA-256: `1823f5f9cf6be1086819db79ad40a5cf6b0c5dbb913367f7b9acaf8d911033b0`.

The artifact is small enough to retain with the source. Other candidate binaries are not saved. Raw data, processed data, row-level predictions and logs remain ignored. No web endpoint loads this model yet. `operational_units_supported` is explicitly false: this artifact is a normalized-space benchmark, not a validated model for RetailSense physical quantities.

From `ml-service`, install the offline dependencies and prepare the pinned dataset using the EDA commands, then run an intentional reproduction into fresh output directories:

```powershell
.\.venv\Scripts\python -m pip install -r requirements-training.txt
.\.venv\Scripts\python -m unittest discover -s tests -v
.\.venv\Scripts\python -m src.train --report-dir data/processed/reproduction/reports --model-dir data/processed/reproduction/models
```

The default command `python -m src.train` refuses to replace an existing selection/report/artifact. Reproduction preserves the committed results/model and writes new ones to the specified directories; it refreshes ignored row-level predictions under `data/processed/benchmark-predictions/`. The program produces JSON evidence and a selected artifact; this interpretive report is maintained separately. Fixed CPU configuration and recorded package versions support repetition; cross-platform or dependency changes may change numerical results. Joblib files should only be loaded from trusted project artifacts.

## Verification and review boundary

- **21 Python tests passed**, including exact metric examples, zero denominators, daily-key alignment, history validation, training/prediction feature parity, recursive future-target invariance, validation-only selection and synthetic fit/artifact roundtrip. Dependency consistency and compilation passed.
- The full experiment fitted all 1,500,000 initial and 3,000,000 refit rows, with 200 trees each. Initial fit took 15.40 seconds and refit 32.48 seconds on this machine. No failed benchmark run or tuning run preceded these results.
- Independent recomputation from saved predictions matched all six daily metric rows, including scikit-learn MAE/RMSE checks. Source/config/artifact hashes and pre-test selection evidence were checked.
- The saved artifact was loaded in a fresh Python process and reproduced all **350,000 test predictions exactly** with the same model version.
- The Phase 1–4 backend regression suite previously passed 184 checks at Phase 5 preflight. This Gate 2 change does not alter backend/frontend/Prisma/FastAPI endpoints; no additional web build/browser run was performed.

Limitations: one validation origin and one test origin; 97 days of one market's history; only seven final test days; normalized and stockout-censored targets; weaker period-total gains; no proven operational transfer. A 30-day result is validation evidence only. No three-month forecast was evaluated or produced, and no reliable three-month claim is supported.

**Stop for Gate 2 review before web integration.** The next gate must use RetailSense's own sales quantities/base units as required by the owner, and explicitly resolve how the forecasting method will be validated for that data scale. Merely feeding physical quantities to this normalized-data tree model would not establish accuracy. Forecast integration, revenue calculations, replenishment and alerts remain unfinished.
