"""Reproducible Gate 1 audit and feature preparation. No training or prediction."""

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import pyarrow.compute as pc
import pyarrow.parquet as pq

from .dataset import RAW_DIR, ROOT, dataset_files
from .features import MODEL_FEATURES, assign_split, build_features
from .preprocessing import CONTEXT, KEY, SCALARS, clean_daily


def json_write(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


def inspect_hourly(path: Path) -> dict:
    """Audit every hourly list in bounded batches; lists never become model inputs."""
    stats = {"null_lists": 0, "invalid_length_rows": 0, "invalid_hourly_sales_rows": 0,
             "invalid_hourly_status_rows": 0, "daily_hourly_sum_mismatch_rows": 0,
             "stock_count_6_to_22_exclusive_mismatch_rows": 0, "stockout_hours_6_to_22": 0,
             "total_hours_6_to_22": 0, "null_elements": 0}
    columns = ["sale_amount", "stock_hour6_22_cnt", "hours_sale", "hours_stock_status"]
    for batch in pq.ParquetFile(path).iter_batches(batch_size=32768, columns=columns):
        arrays = {name: batch.column(name) for name in columns}
        for name in ["hours_sale", "hours_stock_status"]:
            stats["null_lists"] += arrays[name].null_count
            stats["null_elements"] += arrays[name].values.null_count
        lengths = [pc.list_value_length(arrays[name]).to_numpy(zero_copy_only=False)
                   for name in ["hours_sale", "hours_stock_status"]]
        bad_length = (lengths[0] != 24) | (lengths[1] != 24)
        stats["invalid_length_rows"] += int(bad_length.sum())
        if bad_length.any() or stats["null_lists"] or stats["null_elements"]:
            raise ValueError(f"Invalid hourly arrays in {path.name}: {stats}")
        sales = pc.list_flatten(arrays["hours_sale"]).to_numpy().reshape(-1, 24)
        status = pc.list_flatten(arrays["hours_stock_status"]).to_numpy().reshape(-1, 24)
        stats["invalid_hourly_sales_rows"] += int(((sales < 0) | ~np.isfinite(sales)).any(axis=1).sum())
        stats["invalid_hourly_status_rows"] += int((~np.isin(status, [0, 1]).all(axis=1)).sum())
        stats["daily_hourly_sum_mismatch_rows"] += int((~np.isclose(
            sales.sum(axis=1), arrays["sale_amount"].to_numpy(), rtol=1e-7, atol=1e-8)).sum())
        count = status[:, 6:22].sum(axis=1)
        stats["stock_count_6_to_22_exclusive_mismatch_rows"] += int((count != arrays["stock_hour6_22_cnt"].to_numpy()).sum())
        stats["stockout_hours_6_to_22"] += int(count.sum())
        stats["total_hours_6_to_22"] += len(count) * 16
    return stats


def summarize(frame: pd.DataFrame) -> dict:
    pair = frame.groupby(KEY[:2], sort=False)
    length = pair.size()
    span = (pair.dt.max() - pair.dt.min()).dt.days + 1
    zeros = frame.sale_amount.eq(0)
    stockout = frame.stock_hour6_22_cnt.gt(0)
    return {
        "rows": len(frame), "date_start": frame.dt.min().date().isoformat(),
        "date_end": frame.dt.max().date().isoformat(), "days": frame.dt.nunique(),
        "stores": frame.store_id.nunique(), "products": frame.product_id.nunique(),
        "pairs": len(length), "cities": frame.city_id.nunique(),
        "series_days_min": int(length.min()), "series_days_max": int(length.max()),
        "missing_pair_days_within_span": int((span - length).sum()),
        "duplicate_key_rows": int(frame.duplicated(KEY).sum()),
        "missing_cells": frame[SCALARS].isna().sum().to_dict(),
        "zero_rows": int(zeros.sum()), "zero_percent": float(zeros.mean() * 100),
        "all_zero_pairs": int(pair.sale_amount.max().eq(0).sum()),
        "any_stockout_rows": int(stockout.sum()), "any_stockout_percent": float(stockout.mean() * 100),
        "full_16_hour_stockout_rows": int(frame.stock_hour6_22_cnt.eq(16).sum()),
        "zero_with_stockout_rows": int((zeros & stockout).sum()),
        "zero_without_stockout_rows": int((zeros & frame.stock_hour6_22_cnt.eq(0)).sum()),
        "sale_quantiles": frame.sale_amount.quantile([0, .25, .5, .75, .95, .99, .999, 1]).to_dict(),
        "sale_mean": float(frame.sale_amount.mean()),
        "weekday_sale_mean": frame.groupby(frame.dt.dt.dayofweek).sale_amount.mean().to_dict(),
    }


def make_charts(frame: pd.DataFrame, report_dir: Path) -> None:
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    fig, axes = plt.subplots(2, 2, figsize=(12, 8), layout="constrained")
    axes[0, 0].hist(np.log1p(frame.sale_amount.dropna()), bins=60, color="#286C8E")
    axes[0, 0].set(title="Published sales distribution", xlabel="log(1 + normalized sales)", ylabel="Daily rows")
    daily = frame.groupby("dt").sale_amount.mean()
    axes[0, 1].plot(daily.index, daily.values, color="#286C8E")
    axes[0, 1].tick_params(axis="x", rotation=25)
    axes[0, 1].set(title="Daily mean across 50,000 series", ylabel="Normalized sales")
    weekly = frame.groupby(frame.dt.dt.dayofweek).sale_amount.mean().reindex(range(7))
    axes[1, 0].bar(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], weekly, color="#286C8E")
    axes[1, 0].set(title="Observed weekday pattern", ylabel="Mean normalized sales")
    counts = frame.stock_hour6_22_cnt.value_counts().sort_index()
    axes[1, 1].bar(counts.index, counts.values / len(frame) * 100, color="#BA6C38")
    axes[1, 1].set(title="Stockout duration per day", xlabel="Out-of-stock hours (06:00–22:00)", ylabel="Daily rows (%)")
    fig.suptitle("FreshRetailNet-50K • Full-data descriptive EDA", fontsize=15)
    fig.savefig(report_dir / "eda_overview.png", dpi=150)
    plt.close(fig)


def run(raw_dir: Path, output_dir: Path, report_dir: Path) -> dict:
    if output_dir.resolve() == raw_dir.resolve() or raw_dir.resolve() in output_dir.resolve().parents:
        raise ValueError("Processed output must remain outside the raw dataset directory")
    manifest, paths = dataset_files(raw_dir)
    frames, raw = [], {}
    for path in paths:
        print(f"Auditing {path.name}", flush=True)
        parquet = pq.ParquetFile(path)
        if set(parquet.schema_arrow.names) != set(SCALARS + ["hours_sale", "hours_stock_status"]):
            raise ValueError(f"Unexpected schema in {path.name}")
        data = pd.read_parquet(path, columns=SCALARS)
        raw[path.stem] = {"rows": len(data), "bytes": path.stat().st_size,
                          "schema": {f.name: str(f.type) for f in parquet.schema_arrow},
                          "missing": data.isna().sum().to_dict(),
                          "numeric_ranges": data.drop(columns="dt").agg(["min", "max"]).to_dict(),
                          "hourly": inspect_hourly(path)}
        data["source_split"] = path.stem
        frames.append(data)
    joined = pd.concat(frames, ignore_index=True)
    del frames
    # Rare duplicate-key input requires comparison of original sequence contents too.
    # The pinned release has no duplicate keys, so hourly arrays normally stay in batches.
    if joined.duplicated(KEY).any():
        joined = pd.concat([pd.read_parquet(path).assign(source_split=path.stem) for path in paths], ignore_index=True)
    clean, cleaning = clean_daily(joined)
    del joined
    clean = clean.drop(columns=["hours_sale", "hours_stock_status"], errors="ignore")
    output_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    clean.to_parquet(output_dir / "daily_clean.parquet", index=False)
    print("Building past-only features", flush=True)
    features = build_features(clean[KEY + ["sale_amount", "source_split"]])
    # Proposal only. Gate 2 must approve boundaries and use fixed-origin recursive evaluation.
    features["proposed_split"] = assign_split(features.dt, "2024-05-26", "2024-06-25")
    features.to_parquet(output_dir / "daily_features.parquet", index=False)
    stats = {
        "gate": "1 - data preparation and EDA only; no model trained",
        "manifest": manifest, "raw": raw, "cleaning": cleaning,
        "overall": summarize(clean),
        "source_splits": {name: summarize(part) for name, part in clean.groupby("source_split")},
        "proposed_features": MODEL_FEATURES,
        "feature_preparation": {"rows": len(features), "eligible_rows": int(features.training_eligible.sum()),
                                "incomplete_history_rows": int((~features.history_complete).sum()),
                                "missing_target_rows": int(features.sale_amount.isna().sum())},
        "proposed_split": {},
        "context_sale_correlations_descriptive_only": clean[["sale_amount"] + CONTEXT].corr()["sale_amount"].drop("sale_amount").to_dict(),
        "software": {name: importlib.metadata.version(name) for name in ["pandas", "numpy", "pyarrow", "matplotlib"]},
    }
    for name, part in features.groupby("proposed_split"):
        eligible = part.loc[part.training_eligible]
        stats["proposed_split"][name] = {
            "start": part.dt.min().date().isoformat(), "end": part.dt.max().date().isoformat(),
            "days": int(part.dt.nunique()), "rows": len(part), "eligible_rows": len(eligible),
            "eligible_start": eligible.dt.min().date().isoformat() if len(eligible) else None,
        }
    make_charts(clean, report_dir)
    stats["outputs"] = {}
    for path in sorted(output_dir.glob("daily_*.parquet")):
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        stats["outputs"][path.name] = {"bytes": path.stat().st_size, "sha256": digest}
    # Convert numpy scalars without allowing nonstandard NaN JSON.
    stats = json.loads(json.dumps(stats, default=lambda v: v.item()))
    json_write(report_dir / "eda_summary.json", stats)
    print(json.dumps({"overall": stats["overall"], "cleaning": cleaning,
                      "features": stats["feature_preparation"], "split": stats["proposed_split"]}, default=lambda v: v.item(), indent=2), flush=True)
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data/processed/freshretailnet-50k")
    parser.add_argument("--report-dir", type=Path, default=ROOT / "reports")
    args = parser.parse_args()
    run(args.raw_dir, args.output_dir, args.report_dir)
