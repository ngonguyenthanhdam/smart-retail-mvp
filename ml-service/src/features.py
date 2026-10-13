"""Historical daily features. These are one-step rows, not multi-step backtests."""

import numpy as np
import pandas as pd

from .preprocessing import KEY

LAGS = (1, 7, 14, 30)
WINDOWS = (7, 14, 30)
HISTORY_FEATURES = [f"lag_{n}" for n in LAGS] + [f"rolling_mean_{n}" for n in WINDOWS]
MODEL_FEATURES = HISTORY_FEATURES + ["day_of_week", "month"]


def build_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Use exact calendar lags and complete prior calendar windows within each pair.

    Missing dates remain unknown, never zero. No forward/back fill or normalization
    is fitted here. A missing observation makes affected full-window means NA.
    """
    data = frame.sort_values(KEY).reset_index(drop=True).copy()
    if data.duplicated(KEY).any() or data[KEY].isna().any().any():
        raise ValueError("Feature input needs unique, non-missing daily keys")
    if not pd.api.types.is_datetime64_any_dtype(data.dt):
        raise ValueError("Feature dates must be parsed first")
    if not data.dt.eq(data.dt.dt.normalize()).all():
        raise ValueError("Feature dates must have daily granularity")
    groups = data.groupby(KEY[:2], sort=False)
    lookup = data.set_index(KEY).sale_amount
    for lag in LAGS:
        index = pd.MultiIndex.from_arrays([
            data.store_id, data.product_id, data.dt - pd.Timedelta(days=lag)], names=KEY)
        data[f"lag_{lag}"] = lookup.reindex(index).to_numpy()
    previous = groups.sale_amount.shift(1)
    for window in WINDOWS:
        mean = (previous.groupby([data.store_id, data.product_id], sort=False)
                .rolling(window, min_periods=window).mean().reset_index(level=[0, 1], drop=True))
        full_calendar_window = data.dt.sub(groups.dt.shift(window)).eq(pd.Timedelta(days=window))
        data[f"rolling_mean_{window}"] = mean.where(full_calendar_window)
    data["day_of_week"] = data.dt.dt.dayofweek.astype("int8")
    data["month"] = data.dt.dt.month.astype("int8")
    data["history_complete"] = data[HISTORY_FEATURES].notna().all(axis=1)
    data["training_eligible"] = data.history_complete & data.sale_amount.notna() & np.isfinite(data.sale_amount)
    return data


def assign_split(dates: pd.Series, train_end: str, validation_end: str) -> pd.Series:
    """Labels only; boundaries are explicit and never shuffled."""
    first, second = pd.Timestamp(train_end), pd.Timestamp(validation_end)
    if first >= second:
        raise ValueError("Training must end before validation")
    return pd.Series(np.select([dates <= first, dates <= second], ["train", "validation"],
                               default="test"), index=dates.index, name="proposed_split")
