"""Offline fixed-origin forecasts in FreshRetailNet's published target space."""

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from .features import LAGS, MODEL_FEATURES, WINDOWS
from .preprocessing import KEY

ALGORITHMS = ("SeasonalNaive", "LightGBM")
TARGET_SPACE = "freshretailnet_normalized"


def history_panel(history: pd.DataFrame, origin: str | pd.Timestamp) -> pd.DataFrame:
    """Require complete 30-day history for every supplied pair; never fill gaps."""
    required = KEY + ["sale_amount"]
    if not set(required).issubset(history.columns) or history.empty:
        raise ValueError("History must contain nonempty store_id, product_id, dt, sale_amount")
    data = history[required].copy()
    cutoff = pd.Timestamp(origin)
    if pd.isna(cutoff) or cutoff.tz is not None or cutoff != cutoff.normalize():
        raise ValueError("Origin must be a timezone-free calendar date")
    if not pd.api.types.is_datetime64_any_dtype(data.dt) or data.dt.dt.tz is not None:
        raise ValueError("History dt must contain parsed timezone-free daily dates")
    if data[KEY].isna().any().any() or data.duplicated(KEY).any():
        raise ValueError("History keys must be non-missing and unique per day")
    if not data.dt.eq(data.dt.dt.normalize()).all():
        raise ValueError("History must have daily granularity")
    if data.dt.gt(cutoff).any():
        raise ValueError("History contains observations after the forecast origin")
    try:
        values = data.sale_amount.to_numpy(dtype=float)
    except (ValueError, TypeError) as exc:
        raise ValueError("History sales must be numeric") from exc
    if not np.isfinite(values).all() or (values < 0).any():
        raise ValueError("History sales must be finite, nonnegative and observed")
    data["sale_amount"] = values
    pairs = pd.MultiIndex.from_frame(data[KEY[:2]].drop_duplicates()).sort_values()
    dates = pd.date_range(cutoff - pd.Timedelta(days=29), cutoff)
    recent = data.loc[data.dt >= dates[0]]
    panel = recent.pivot(index=KEY[:2], columns="dt", values="sale_amount").reindex(index=pairs, columns=dates)
    if panel.isna().any().any():
        count = int(panel.isna().any(axis=1).sum())
        raise ValueError(f"INSUFFICIENT_HISTORY: {count} pairs lack 30 complete daily observations")
    return panel


def step_features(past: np.ndarray, date: pd.Timestamp) -> pd.DataFrame:
    """Rows are pairs; columns are earlier daily values in chronological order."""
    if past.ndim != 2 or past.shape[1] < 30 or not np.isfinite(past).all() or (past < 0).any():
        raise ValueError("Step features require at least 30 finite nonnegative past days")
    columns = {f"lag_{lag}": past[:, -lag] for lag in LAGS}
    columns.update({f"rolling_mean_{window}": past[:, -window:].mean(axis=1) for window in WINDOWS})
    columns["day_of_week"] = np.full(len(past), date.dayofweek, dtype=np.int8)
    columns["month"] = np.full(len(past), date.month, dtype=np.int8)
    return pd.DataFrame(columns, columns=MODEL_FEATURES)


@dataclass
class DemandModel:
    algorithm: str
    version: str
    regressor: Any = None
    target_space: str = TARGET_SPACE

    def predict(self, history: pd.DataFrame, origin: str, horizon: int) -> tuple[pd.DataFrame, dict]:
        if self.algorithm not in ALGORITHMS or self.target_space != TARGET_SPACE:
            raise ValueError("Unsupported algorithm or target space")
        if isinstance(horizon, bool) or not isinstance(horizon, int) or not 1 <= horizon <= 30:
            raise ValueError("Benchmark horizon must be an integer from 1 through 30 days")
        panel = history_panel(history, origin)
        if self.algorithm == "LightGBM" and self.regressor is None:
            raise ValueError("LightGBM artifact is missing its fitted model")
        if self.algorithm == "LightGBM" and list(self.regressor.feature_name_) != MODEL_FEATURES:
            raise ValueError("Artifact feature names/order do not match the forecast contract")
        buffer = np.empty((len(panel), 30 + horizon), dtype=np.float64)
        buffer[:, :30] = panel.to_numpy()
        clipped = 0
        dates = pd.date_range(pd.Timestamp(origin) + pd.Timedelta(days=1), periods=horizon)
        for offset, date in enumerate(dates):
            end = 30 + offset
            if self.algorithm == "SeasonalNaive":
                prediction = buffer[:, end - 7].copy()
            else:
                inputs = step_features(buffer[:, end - 30:end], date)
                prediction = np.asarray(self.regressor.predict(inputs, validate_features=True), dtype=float)
            if prediction.shape != (len(panel),) or not np.isfinite(prediction).all():
                raise ValueError("Model returned invalid or non-finite predictions")
            clipped += int((prediction < 0).sum())
            buffer[:, end] = np.maximum(prediction, 0)
        result = panel.index.to_frame(index=False).loc[lambda x: x.index.repeat(horizon)].reset_index(drop=True)
        result["dt"] = np.tile(dates.to_numpy(), len(panel))
        result["prediction"] = buffer[:, 30:].reshape(-1)
        return result, {"pairs": len(panel), "horizon_days": horizon, "negative_predictions_clipped": clipped}
