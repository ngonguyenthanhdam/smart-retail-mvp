"""Run the approved offline comparison once; stop with a benchmark artifact/report."""

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import subprocess
import time

import joblib
from lightgbm import LGBMRegressor
import numpy as np
import pandas as pd

from .dataset import ROOT, dataset_files, verify_file
from .eda import json_write
from .evaluation import score_predictions, select_algorithm
from .features import MODEL_FEATURES
from .forecasting import ALGORITHMS, DemandModel, TARGET_SPACE
from .preprocessing import KEY

CONFIG_PATH = ROOT / "experiment.json"
PROCESSED = ROOT / "data/processed/freshretailnet-50k"


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def load_config(path: Path = CONFIG_PATH) -> dict:
    config = json.loads(path.read_text(encoding="utf-8"))
    if config["features"] != MODEL_FEATURES or config["target_space"] != TARGET_SPACE:
        raise ValueError("Experiment features or target scale differ from the approved contract")
    dates = [pd.Timestamp(config[name]) for name in ["train_start", "train_end", "validation_end", "test_end"]]
    if not dates[0] < dates[1] < dates[2] < dates[3]:
        raise ValueError("Split dates must be strictly chronological")
    if (dates[2] - dates[1]).days != 30 or (dates[3] - dates[2]).days != 7:
        raise ValueError("Expected 30 validation days and seven test days")
    if config["primary_horizon_days"] != 7 or config["supplementary_horizon_days"] != 30 or config["minimum_history_days"] != 30:
        raise ValueError("Unexpected approved horizons or history window")
    return config


def fit_lightgbm(features: pd.DataFrame, start: str, end: str, params: dict) -> tuple[LGBMRegressor, dict]:
    subset = features.loc[features.dt.between(pd.Timestamp(start), pd.Timestamp(end)) & features.training_eligible]
    if subset.empty:
        raise ValueError("No eligible training rows inside the training period")
    x, y = subset[MODEL_FEATURES], subset.sale_amount
    if not np.isfinite(x.to_numpy()).all() or not np.isfinite(y.to_numpy()).all() or (y < 0).any():
        raise ValueError("Training features/targets must be finite and targets nonnegative")
    model = LGBMRegressor(**params)
    def progress(env):
        if (env.iteration + 1) % 25 == 0:
            print(f"  fitted {env.iteration + 1}/{params['n_estimators']} trees", flush=True)
    started = time.perf_counter()
    model.fit(x, y, callbacks=[progress])
    return model, {"rows": len(subset), "first_target": subset.dt.min().date().isoformat(),
                   "last_target": subset.dt.max().date().isoformat(), "seconds": time.perf_counter() - started,
                   "fitted_trees": model.n_estimators_}


def forecast_window(model: DemandModel, daily: pd.DataFrame, origin: str, horizon: int) -> tuple[pd.DataFrame, dict]:
    cutoff = pd.Timestamp(origin)
    history = daily.loc[daily.dt <= cutoff, KEY + ["sale_amount"]]
    # No target-period values, context or precomputed validation features reach predict().
    return model.predict(history, origin, horizon)


def evaluate_window(predictions: pd.DataFrame, daily: pd.DataFrame, origin: str, horizon: int) -> tuple[dict, pd.DataFrame]:
    start = pd.Timestamp(origin) + pd.Timedelta(days=1)
    end = pd.Timestamp(origin) + pd.Timedelta(days=horizon)
    actuals = daily.loc[daily.dt.between(start, end), KEY + ["sale_amount", "stock_hour6_22_cnt"]]
    return score_predictions(predictions.loc[predictions.dt.between(start, end)], actuals)


def run(report_dir: Path, model_dir: Path) -> dict:
    results_path = report_dir / "training_results.json"
    if results_path.exists() or (report_dir / "model_selection.json").exists() or (model_dir / "demand_model.joblib").exists():
        raise ValueError("Experiment outputs already exist. Use new report/model directories for an intentional reproduction.")
    config = load_config()
    manifest, _ = dataset_files()
    eda = json.loads((ROOT / "reports/eda_summary.json").read_text(encoding="utf-8"))
    if eda["manifest"] != manifest:
        raise ValueError("EDA and dataset provenance differ")
    for name in ["daily_clean.parquet", "daily_features.parquet"]:
        verify_file(PROCESSED / name, eda["outputs"][name])
    daily = pd.read_parquet(PROCESSED / "daily_clean.parquet", columns=KEY + ["sale_amount", "stock_hour6_22_cnt"])
    features = pd.read_parquet(PROCESSED / "daily_features.parquet", columns=["dt", "sale_amount", "training_eligible"] + MODEL_FEATURES)
    if str(daily.dt.min().date()) != config["train_start"] or str(daily.dt.max().date()) != config["test_end"]:
        raise ValueError("Dataset period differs from the approved experiment")
    report_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)
    prediction_dir = ROOT / "data/processed/benchmark-predictions"
    prediction_dir.mkdir(parents=True, exist_ok=True)
    code = {path.name: sha256(path) for path in sorted((ROOT / "src").glob("*.py"))}
    started_at = datetime.now(timezone.utc).isoformat()
    evidence = {"experiment": config, "config_sha256": sha256(CONFIG_PATH), "dataset": manifest,
                "processed_inputs": eda["outputs"], "source_sha256": code, "started_at": started_at,
                "software": {name: importlib.metadata.version(name) for name in
                             ["numpy", "pandas", "lightgbm", "scikit-learn", "scipy", "joblib", "pyarrow"]},
                "python": platform.python_version(), "platform": platform.system(),
                "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                "fits": {}, "results": {"validation_7d": {}, "validation_30d": {}, "test_7d": {}}}
    print("Fitting one fixed LightGBM configuration on initial training dates", flush=True)
    regressor, evidence["fits"]["initial"] = fit_lightgbm(features, config["train_start"], config["train_end"], config["lightgbm"])
    version = config["experiment_version"]
    candidates = {"SeasonalNaive": DemandModel("SeasonalNaive", version + "-seasonal-naive"),
                  "LightGBM": DemandModel("LightGBM", version + "-lightgbm", regressor)}
    for name, candidate in candidates.items():
        print(f"Fixed-origin validation: {name}, 7 and 30 days", flush=True)
        predicted, diagnostic = forecast_window(candidate, daily, config["train_end"], 30)
        for horizon in [7, 30]:
            scores, joined = evaluate_window(predicted, daily, config["train_end"], horizon)
            scores["forecast_diagnostics_30d"] = diagnostic
            evidence["results"][f"validation_{horizon}d"][name] = scores
            print(f"  {horizon}d: {scores['daily']}", flush=True)
            if horizon == 30:
                joined.to_parquet(prediction_dir / f"validation_30d_{name}.parquet", index=False)
    selected = select_algorithm(evidence["results"]["validation_7d"])
    selection = {"algorithm": selected, "selected_at": datetime.now(timezone.utc).isoformat(),
                 "rule": config["selection"], "test_evaluated": False,
                 "validation_7d": {name: scores["daily"] for name, scores in evidence["results"]["validation_7d"].items()},
                 "config_sha256": evidence["config_sha256"], "source_sha256": code}
    json_write(report_dir / "model_selection.json", selection)
    evidence["selection"] = selection
    print(f"Selection frozen before test: {selected}", flush=True)
    print("Refitting the unchanged LightGBM configuration through June 25", flush=True)
    refitted, evidence["fits"]["refit"] = fit_lightgbm(features, config["train_start"], config["validation_end"], config["lightgbm"])
    candidates["LightGBM"] = DemandModel("LightGBM", version + "-lightgbm", refitted)
    del features, regressor
    saved_predictions = None
    for name, candidate in candidates.items():
        print(f"Final fixed-origin test: {name}, seven days", flush=True)
        predicted, diagnostic = forecast_window(candidate, daily, config["validation_end"], 7)
        scores, joined = evaluate_window(predicted, daily, config["validation_end"], 7)
        scores["forecast_diagnostics"] = diagnostic
        evidence["results"]["test_7d"][name] = scores
        joined.to_parquet(prediction_dir / f"test_7d_{name}.parquet", index=False)
        print(f"  {scores['daily']}", flush=True)
        if name == selected:
            saved_predictions = predicted
    selected_model = candidates[selected]
    artifact = model_dir / "demand_model.joblib"
    joblib.dump(selected_model, artifact, compress=3)
    # Only load the artifact just written locally; no untrusted serialized input.
    loaded = joblib.load(artifact)
    repeated, _ = forecast_window(loaded, daily, config["validation_end"], 7)
    pd.testing.assert_frame_equal(saved_predictions, repeated, check_exact=True)
    evidence["artifact"] = {"file": artifact.name, "bytes": artifact.stat().st_size, "sha256": sha256(artifact),
                            "algorithm": selected, "model_version": loaded.version, "load_prediction_equal": True,
                            "target_space": TARGET_SPACE, "operational_units_supported": False}
    evidence["completed_at"] = datetime.now(timezone.utc).isoformat()
    metadata = {"model_version": loaded.version, "algorithm": selected, "created_at": evidence["completed_at"],
                "target": "sale_amount", "target_space": TARGET_SPACE, "operational_units_supported": False,
                "minimum_history_days": 30, "forecast_horizon_limit_days": 30,
                "primary_evaluated_horizon_days": 7, "features": MODEL_FEATURES,
                "fit_target_start": evidence["fits"]["refit"]["first_target"] if selected == "LightGBM" else None,
                "fit_target_end": config["validation_end"] if selected == "LightGBM" else None,
                "parameters": config["lightgbm"] if selected == "LightGBM" else {"season_length": 7},
                "metrics": {split: values[selected] for split, values in evidence["results"].items()},
                "artifact": evidence["artifact"], "dataset": manifest, "software": evidence["software"],
                "source_sha256": code, "config_sha256": evidence["config_sha256"],
                "limitations": ["Normalized source values; no physical-unit conversion or proven operational transfer.",
                                "Observed sales are stockout-censored; no demand recovery.",
                                "30-day validation only; seven-day final test; no validated three-month forecast.",
                                "Selection uses initial-fit validation; final artifact is refitted through June 25."]}
    json_write(model_dir / "model_metadata.json", metadata)
    json_write(results_path, evidence)
    print(f"Saved only {selected}; artifact reload predictions match exactly. Gate 2 complete; stop before web integration.", flush=True)
    return evidence


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-dir", type=Path, default=ROOT / "reports")
    parser.add_argument("--model-dir", type=Path, default=ROOT / "models")
    args = parser.parse_args()
    run(args.report_dir, args.model_dir)
