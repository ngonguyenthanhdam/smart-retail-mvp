"""Validate daily sales without inventing missing demand or correcting stockouts."""

import numpy as np
import pandas as pd

KEY = ["store_id", "product_id", "dt"]
IDS = ["city_id", "store_id", "management_group_id", "first_category_id",
       "second_category_id", "third_category_id", "product_id"]
CONTEXT = ["stock_hour6_22_cnt", "discount", "holiday_flag", "activity_flag",
           "precpt", "avg_temperature", "avg_humidity", "avg_wind_level"]
SCALARS = IDS + ["dt", "sale_amount"] + CONTEXT


def clean_daily(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Retain missing values; fail on invalid core values or conflicting daily keys.

    Exact duplicates are removed and counted. If callers include hourly arrays,
    their contents participate in duplicate comparison too. Invalid optional
    context becomes NA with counts; source values are never changed on disk.
    """
    absent = set(SCALARS) - set(frame.columns)
    if absent:
        raise ValueError(f"Missing columns: {sorted(absent)}")
    data = frame.copy()
    stats = {"input_rows": len(data), "missing_before": data[SCALARS].isna().sum().to_dict(),
             "invalid_context_to_na": {}}
    comparison = data.drop(columns=["source_split"], errors="ignore").copy()
    for column in ["hours_sale", "hours_stock_status"]:
        if column in comparison:
            comparison[column] = comparison[column].map(lambda x: tuple(x) if x is not None else None)
    duplicates = comparison.duplicated()
    del comparison
    dates = data.dt.astype("string")
    parsed = pd.to_datetime(dates, format="%Y-%m-%d", errors="coerce")
    if (parsed.isna() | ~dates.str.fullmatch(r"\d{4}-\d{2}-\d{2}", na=False)).any():
        raise ValueError("Invalid or missing dt; expected an ISO calendar date")
    data["dt"] = parsed
    for column in IDS + ["sale_amount"] + CONTEXT:
        original = data[column]
        numeric = pd.to_numeric(original, errors="coerce")
        invalid = (original.notna() & numeric.isna()) | (numeric.notna() & ~np.isfinite(numeric))
        if column in IDS:
            invalid |= numeric.isna() | (numeric < 0) | (numeric % 1 != 0)
        elif column in ["holiday_flag", "activity_flag"]:
            invalid |= numeric.notna() & ~numeric.isin([0, 1])
        elif column == "stock_hour6_22_cnt":
            invalid |= numeric.notna() & (~numeric.between(0, 16) | (numeric % 1 != 0))
        elif column == "discount":
            invalid |= numeric.notna() & ~numeric.between(0, 1)
        elif column == "avg_humidity":
            invalid |= numeric.notna() & ~numeric.between(0, 100)
        elif column != "avg_temperature":
            invalid |= numeric < 0
        if invalid.any() and column not in CONTEXT:
            raise ValueError(f"Invalid {column}: {int(invalid.sum())} rows; inspect source before proceeding")
        if column in CONTEXT:
            stats["invalid_context_to_na"][column] = int(invalid.sum())
            numeric = numeric.mask(invalid)
        data[column] = numeric
    stats["exact_duplicates_removed"] = int(duplicates.sum())
    data = data.loc[~duplicates].copy()
    if data.duplicated(KEY, keep=False).any():
        raise ValueError("Conflicting Store x Product x Date records; no silent aggregation")
    data = data.sort_values(KEY).reset_index(drop=True)
    stats["clean_rows"] = len(data)
    stats["missing_after"] = data[SCALARS].isna().sum().to_dict()
    stats["invalid_core_rows"] = 0
    return data, stats
