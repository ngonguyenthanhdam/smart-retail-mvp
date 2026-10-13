"""Forecast metrics and exact key alignment; no fitting or feature preparation."""

import numpy as np
import pandas as pd

from .preprocessing import KEY


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    if actual.shape != predicted.shape or actual.ndim != 1 or not len(actual):
        raise ValueError("Metrics need equally sized nonempty one-dimensional arrays")
    if not np.isfinite(actual).all() or not np.isfinite(predicted).all() or (actual < 0).any() or (predicted < 0).any():
        raise ValueError("Metrics need finite nonnegative actuals and predictions")
    error = predicted - actual
    denominator = float(actual.sum())
    return {"rows": len(actual), "actual_sum": denominator, "prediction_sum": float(predicted.sum()),
            "WAPE": float(np.abs(error).sum() / denominator) if denominator > 0 else None,
            "MAE": float(np.abs(error).mean()), "RMSE": float(np.sqrt(np.square(error).mean())),
            "mean_error": float(error.mean())}


def score_predictions(predictions: pd.DataFrame, actuals: pd.DataFrame) -> tuple[dict, pd.DataFrame]:
    if predictions.empty or actuals.empty or predictions.duplicated(KEY).any() or actuals.duplicated(KEY).any():
        raise ValueError("Scoring requires unique nonempty daily keys")
    if predictions[KEY].isna().any().any() or actuals[KEY].isna().any().any():
        raise ValueError("Scoring keys must be non-missing")
    joined = actuals.merge(predictions, on=KEY, how="outer", validate="one_to_one", indicator=True)
    if not joined._merge.eq("both").all():
        raise ValueError("Prediction and actual keys differ; cannot silently omit targets")
    result = {"daily": metrics(joined.sale_amount, joined.prediction)}
    totals = joined.groupby(KEY[:2])[["sale_amount", "prediction"]].sum()
    result["period_totals"] = metrics(totals.sale_amount, totals.prediction)
    result["by_date"] = {date.date().isoformat(): metrics(part.sale_amount, part.prediction)
                         for date, part in joined.groupby("dt", sort=True)}
    if "stock_hour6_22_cnt" in joined:
        result["stockout_slices"] = {}
        for name, mask in [("no_stockout", joined.stock_hour6_22_cnt.eq(0)),
                           ("some_stockout", joined.stock_hour6_22_cnt.gt(0))]:
            result["stockout_slices"][name] = metrics(joined.loc[mask, "sale_amount"], joined.loc[mask, "prediction"]) if mask.any() else None
    return result, joined.drop(columns="_merge")


def select_algorithm(validation: dict) -> str:
    """Selection receives only primary validation results, never test scores."""
    if set(validation) != {"SeasonalNaive", "LightGBM"}:
        raise ValueError("Expected exactly SeasonalNaive and LightGBM validation results")
    ranked = []
    for name, result in validation.items():
        values = [result["daily"][metric] for metric in ["WAPE", "MAE", "RMSE"]]
        if any(value is None or not np.isfinite(value) for value in values):
            raise ValueError("Primary validation metrics are undefined")
        ranked.append((tuple(values) + (0 if name == "SeasonalNaive" else 1,), name))
    return min(ranked)[1]
