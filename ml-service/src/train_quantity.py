"""Train/evaluate a quantity model from a versioned, observed daily CSV snapshot."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

import joblib
from lightgbm import LGBMRegressor
import numpy as np
import pandas as pd

from .features import MODEL_FEATURES, build_features
from .quantity_model import ALGORITHMS, MAX_HORIZON, ROOT, TARGET_SPACE, QuantityModel, activate, sha256, version_path

PARAMETERS = {"objective": "regression", "n_estimators": 200, "learning_rate": 0.05,
              "num_leaves": 31, "min_child_samples": 80, "n_jobs": 4,
              "random_state": 20261006, "deterministic": True, "force_col_wise": True, "verbosity": -1}
KEY = ["store_id", "product_id", "dt"]


def load_snapshot(path: Path, allow_synthetic: bool = False) -> pd.DataFrame:
    data = pd.read_csv(path, dtype={"store_id": str, "product_id": str, "unit_code": str, "unit": str, "source": str})
    if "unit_code" not in data and "unit" in data:
        data = data.rename(columns={"unit": "unit_code"})
    required = {"date", "store_id", "product_id", "quantity", "unit_code", "source"}
    if not required.issubset(data) or data.empty or data[list(required)].isna().any().any():
        raise ValueError("Snapshot requires nonempty date,store_id,product_id,quantity,unit_code,source")
    if any(data[column].astype(str).str.strip().eq("").any() for column in ["store_id", "product_id", "unit_code", "source"]):
        raise ValueError("Empty snapshot keys/units/source")
    if not data.date.astype(str).str.fullmatch(r"\d{4}-\d{2}-\d{2}").all():
        raise ValueError("Snapshot dates must be ISO calendar dates")
    data["dt"] = pd.to_datetime(data.date, format="%Y-%m-%d", errors="raise")
    data["sale_amount"] = pd.to_numeric(data.quantity, errors="raise")
    if not np.isfinite(data.sale_amount).all() or (data.sale_amount < 0).any() or (data.sale_amount >= 10_000_000_000).any():
        raise ValueError("Snapshot quantity must be finite, nonnegative and in the API range")
    if data.duplicated(KEY).any():
        raise ValueError("Duplicate store/product/date snapshot rows")
    if (data.groupby(KEY[:2]).unit_code.nunique() != 1).any():
        raise ValueError("A series must use a single consistent base unit")
    synthetic = data.source.str.upper().str.contains("SYNTHETIC|DEMO", regex=True)
    if synthetic.any() and not allow_synthetic:
        raise ValueError("Synthetic observations require --allow-synthetic and cannot be activated")
    return data.sort_values(KEY).reset_index(drop=True)


def metric(actual, predicted):
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    error = actual - predicted
    denominator = float(actual.sum())
    return {"wape": float(np.abs(error).sum() / denominator) if denominator > 0 else None,
            "mae": float(np.abs(error).mean()), "rmse": float(np.sqrt(np.square(error).mean())),
            "bias": float((predicted.sum() - denominator) / denominator) if denominator > 0 else None,
            "actual_total": denominator, "predicted_total": float(predicted.sum()), "rows": len(actual)}


def score(predicted: pd.DataFrame, actual: pd.DataFrame, horizon: int, origin: pd.Timestamp):
    end = origin + pd.Timedelta(days=horizon)
    forecast = predicted.loc[predicted.dt <= end]
    joined = forecast.merge(actual[KEY + ["sale_amount", "unit_code"]], on=KEY, how="left", validate="one_to_one")
    if len(joined) != len(forecast) or joined.sale_amount.isna().any():
        raise ValueError("Holdout observations do not cover forecast keys")
    output = {}
    for unit, group in joined.groupby("unit_code", sort=True):
        totals = group.groupby(KEY[:2])[["sale_amount", "prediction"]].sum()
        monthly = group.assign(month=group.dt.dt.strftime("%Y-%m")).groupby(KEY[:2] + ["month"])[["sale_amount", "prediction"]].sum()
        output[unit] = {"daily": metric(group.sale_amount, group.prediction),
                        "period": metric(totals.sale_amount, totals.prediction),
                        "calendar_month_buckets": metric(monthly.sale_amount, monthly.prediction)}
    return {"origin": origin.date().isoformat(), "start": (origin + pd.Timedelta(days=1)).date().isoformat(),
            "end": end.date().isoformat(), "horizon_days": horizon, "by_unit": output}


def selection_score(results: dict) -> float:
    # Freeze rule before evaluation: equal horizon/unit weighting of daily and period WAPE.
    values = [0.5 * unit["daily"]["wape"] + 0.5 * unit["period"]["wape"]
              for horizon in results.values() for unit in horizon["by_unit"].values()
              if unit["daily"]["wape"] is not None and unit["period"]["wape"] is not None]
    return float(np.mean(values)) if values else float("inf")


def fit(features: pd.DataFrame, end: pd.Timestamp, parameters=None):
    rows = features.loc[(features.dt <= end) & features.training_eligible]
    if len(rows) < 30:
        raise ValueError("Insufficient eligible training targets")
    model = LGBMRegressor(**(parameters or PARAMETERS))
    model.fit(rows[MODEL_FEATURES], rows.sale_amount)
    return model, {"rows": len(rows), "first_target": rows.dt.min().date().isoformat(), "last_target": rows.dt.max().date().isoformat()}


def run(snapshot: Path, version: str, source_kind: str = "EXTERNAL", evaluation_days: int = 124,
        allow_synthetic: bool = False, activate_model: bool = False, model_root: Path = ROOT / "models",
        parameters=None, algorithms=None, progress=None, strict_series: bool = False):
    parameters = {**PARAMETERS, **(parameters or {})}
    algorithms = tuple(algorithms or ALGORITHMS)
    if not algorithms or any(name not in ALGORITHMS for name in algorithms):
        raise ValueError("Unsupported algorithm")
    notify = progress or (lambda stage, detail: None)
    notify("DATA_COLLECTION", {"status": "RUNNING"})
    if not 30 <= evaluation_days <= MAX_HORIZON:
        raise ValueError("evaluation-days must be 30..124")
    destination = version_path(version, model_root)
    if destination.exists():
        raise ValueError("Model version already exists; choose a new immutable version")
    data = load_snapshot(snapshot, allow_synthetic)
    notify("EDA", {"status": "RUNNING", "rows": len(data)})
    contains_synthetic = bool(data.source.str.upper().str.contains("SYNTHETIC|DEMO", regex=True).any())
    if source_kind == "STORE_HISTORY" and not data.source.eq("STORE_HISTORY").all():
        raise ValueError("STORE_HISTORY provenance requires exclusively STORE_HISTORY snapshot rows")
    if source_kind == "EXTERNAL" and data.source.eq("STORE_HISTORY").any():
        raise ValueError("Use --source-kind STORE_HISTORY for the application's sales export")
    end = data.dt.max()
    validation_origin = end - pd.Timedelta(days=2 * evaluation_days)
    test_origin = end - pd.Timedelta(days=evaluation_days)
    needed = pd.date_range(validation_origin - pd.Timedelta(days=29), end)
    kept, skipped = [], []
    for pair, group in data.groupby(KEY[:2], sort=True):
        recent = group.loc[group.dt >= needed[0], "dt"]
        if len(recent) == len(needed) and recent.to_numpy().tolist() == needed.to_numpy().tolist() and group.dt.min() <= validation_origin - pd.Timedelta(days=59):
            kept.append(group)
        else:
            skipped.append({"store_id": pair[0], "product_id": pair[1], "reason": "insufficient continuous holdout/history or training coverage"})
    if not kept:
        raise ValueError("No series has 60 training days plus two complete evaluation windows; use a longer snapshot or shorter --evaluation-days")
    if strict_series and skipped:
        raise ValueError(f"{len(skipped)} series lack continuous training/holdout coverage. Select or correct the dataset; no series was silently removed.")
    data = pd.concat(kept, ignore_index=True)
    features = build_features(data)
    notify("FEATURES", {"features": MODEL_FEATURES, "eligible_rows": int(features.training_eligible.sum())})
    horizons = sorted(set([value for value in [7, 30, 31, 90, 124] if value <= evaluation_days] + [evaluation_days]))
    protocol = {"selection": "mean across horizons/units of 0.5 daily WAPE + 0.5 period WAPE; tie favors simpler baseline",
                "horizons": horizons, "validation_origin": validation_origin.date().isoformat(),
                "test_origin": test_origin.date().isoformat(), "test_end": end.date().isoformat(),
                "split_rows": {"train": int(data.dt.le(validation_origin).sum()),
                               "validation": int((data.dt.gt(validation_origin) & data.dt.le(test_origin)).sum()),
                               "test": int(data.dt.gt(test_origin).sum())},
                "parameters": parameters, "algorithms": list(algorithms), "snapshot_sha256": sha256(snapshot),
                "source_kind": source_kind, "contains_synthetic": contains_synthetic,
                "created_at": datetime.now(timezone.utc).isoformat()}
    # Persist precommitted protocol before fitting or inspecting held-out performance.
    destination.mkdir(parents=True)
    (destination / "protocol.json").write_text(json.dumps(protocol, indent=2) + "\n", encoding="utf-8", newline="\n")
    notify("SPLITTING", {"validation_origin": str(validation_origin.date()), "test_origin": str(test_origin.date()), "test_end": str(end.date())})
    notify("TRAINING", {"algorithm": "LightGBM" if "LightGBM" in algorithms else "Statistical baselines"})
    regressor, initial_fit = fit(features, validation_origin, parameters) if "LightGBM" in algorithms else (None, {"rows": int(features.training_eligible.sum())})
    validation = {}
    for name in algorithms:
        candidate = QuantityModel(name, version, regressor if name == "LightGBM" else None)
        predicted, _ = candidate.predict(data.loc[data.dt <= validation_origin], str(validation_origin.date()), evaluation_days)
        validation[name] = {str(horizon): score(predicted, data, horizon, validation_origin) for horizon in horizons}
    selected = min(algorithms, key=lambda name: (selection_score(validation[name]), ALGORITHMS.index(name)))
    if not np.isfinite(selection_score(validation[selected])):
        raise ValueError("All-zero evaluation targets cannot establish an activation score")
    selection = {"algorithm": selected, "scores": {name: selection_score(validation[name]) for name in algorithms},
                 "selected_before_test": True, "selected_at": datetime.now(timezone.utc).isoformat()}
    (destination / "selection.json").write_text(json.dumps(selection, indent=2) + "\n", encoding="utf-8", newline="\n")
    notify("EVALUATION", {"selected_on_validation": selected, "scores": selection["scores"]})
    refitted, refit_info = fit(features, test_origin, parameters) if "LightGBM" in algorithms else (None, None)
    candidate_directory = destination / "candidates"
    candidate_directory.mkdir()
    candidate_path = candidate_directory / "lightgbm.joblib"
    if refitted is not None:
        joblib.dump(QuantityModel("LightGBM", version + "-candidate", refitted), candidate_path, compress=3)
    test, selected_model = {}, None
    diagnostics = {}
    for name in algorithms:
        candidate = QuantityModel(name, version, refitted if name == "LightGBM" else None)
        predicted, _ = candidate.predict(data.loc[data.dt <= test_origin], str(test_origin.date()), evaluation_days)
        test[name] = {str(horizon): score(predicted, data, horizon, test_origin) for horizon in horizons}
        if progress is not None:
            joined = predicted.merge(data[KEY + ["sale_amount", "unit_code"]], on=KEY, validate="one_to_one")
            examples = joined.iloc[:min(3000, len(joined))]
            diagnostics[name] = {"samples": [{"store_id": row.store_id, "product_id": row.product_id,
                "date": row.dt.strftime("%Y-%m-%d"), "actual": float(row.sale_amount), "predicted": float(row.prediction),
                "unit": row.unit_code} for row in examples.itertuples()], "sample_limit": 3000,
                "by_unit_error": {str(unit): {"quantiles": np.quantile(group.prediction - group.sale_amount, [0, .25, .5, .75, 1]).tolist(),
                    "distribution": {"counts": np.histogram(group.prediction - group.sale_amount, bins=12)[0].tolist(),
                                     "edges": np.histogram(group.prediction - group.sale_amount, bins=12)[1].tolist()}}
                                  for unit, group in joined.groupby("unit_code")},
                "by_series": [{"store": str(store), "product": str(product), "unit": str(group.unit_code.iloc[0]),
                               **metric(group.sale_amount, group.prediction)}
                              for (store, product), group in joined.groupby(KEY[:2])]}
        if name == selected:
            selected_model = candidate
    artifact = destination / "model.joblib"
    joblib.dump(selected_model, artifact, compress=3)
    reloaded = joblib.load(artifact)
    history = data.loc[data.dt <= test_origin]
    pd.testing.assert_frame_equal(selected_model.predict(history, str(test_origin.date()), evaluation_days)[0],
                                  reloaded.predict(history, str(test_origin.date()), evaluation_days)[0], check_exact=True)
    provenance_path = snapshot.with_suffix(".provenance.json")
    provenance = json.loads(provenance_path.read_text(encoding="utf-8")) if provenance_path.exists() else {
        "dataset": "RetailSense daily snapshot" if source_kind == "STORE_HISTORY" else "User supplied external quantity snapshot",
        "source_kind": source_kind, "sources": sorted(data.source.unique().tolist())}
    if provenance.get("snapshot_sha256", protocol["snapshot_sha256"]) != protocol["snapshot_sha256"]:
        raise ValueError("Snapshot provenance checksum mismatch")
    validation_summary = {"evaluated_horizons_days": horizons, "source_kind": source_kind,
                          "selected_on": "validation only", "selection": selection,
                          "validation": validation[selected], "test": test[selected],
                          "pairs": len(kept), "skipped_pairs": len(skipped),
                          "independent_test": True, "calendar_buckets_include_partial_boundary_months": True}
    # Scale compatibility is distinct from transfer accuracy: external evaluation never certifies actual stores.
    metadata = {"model_version": version, "algorithm": selected, "target_space": TARGET_SPACE,
                "operational_units_supported": True, "real_world_accuracy_verified": False,
                "minimum_history_days": 30, "forecast_horizon_limit_days": MAX_HORIZON,
                "features": MODEL_FEATURES, "activation_eligible": not contains_synthetic and evaluation_days == MAX_HORIZON,
                "contains_synthetic": contains_synthetic, "created_at": datetime.now(timezone.utc).isoformat(),
                "artifact": {"file": artifact.name, "bytes": artifact.stat().st_size, "sha256": sha256(artifact)},
                "validation_source": provenance["dataset"], "provenance": provenance,
                "supported_units": sorted(data.unit_code.unique().tolist()),
                "unit_validation_note": "Only the listed source units were evaluated; numerical support for a store base unit does not establish transfer accuracy.",
                "selection_reason": f"{selected} had the lowest predeclared validation score; the independent test did not choose the model.",
                "trained_candidate": {"algorithm": "LightGBM", "file": "candidates/lightgbm.joblib", "sha256": sha256(candidate_path),
                                      "fit": refit_info, "parameters": parameters} if refitted is not None else None,
                "training": {"initial": initial_fit, "deployed_fit": refit_info if selected == "LightGBM" else None,
                             "snapshot_sha256": protocol["snapshot_sha256"], "source_kind": source_kind,
                             "rows": len(data), "pairs": len(kept), "units": sorted(data.unit_code.unique().tolist()),
                             "start_date": data.dt.min().date().isoformat(), "end_date": data.dt.max().date().isoformat()},
                "validation": validation_summary,
                "limitations": ["Observed sales, not recovered demand lost during stockouts.",
                                "External unit-sales evaluation does not establish accuracy for this store, CAN or KG products.",
                                "One validation origin and one independent test origin; not the official M5 competition score.",
                                "Long-range recursive forecasts are planning estimates; no calibrated confidence interval.",
                                "Revenue assumes the current selling price remains unchanged."]}
    report = {"protocol": protocol, "selection": selection, "validation": validation, "test": test,
              "skipped": skipped, "provenance": provenance, "artifact": metadata["artifact"],
              "trained_candidate": metadata["trained_candidate"]}
    if progress is not None:
        report["diagnostics"] = diagnostics
        report["feature_importance"] = dict(zip(MODEL_FEATURES, map(int, refitted.feature_importances_))) if refitted is not None else None
    for name, value in [("metadata.json", metadata), ("evaluation.json", report)]:
        (destination / name).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    if activate_model:
        activate(version, model_root)
    notify("COMPLETED", {"model_version": version, "algorithm": selected})
    print(json.dumps({"model_version": version, "algorithm": selected, "scores": selection["scores"],
                      "pairs": len(kept), "horizons": horizons, "activated": activate_model}, indent=2))
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--source-kind", choices=["EXTERNAL", "STORE_HISTORY"], default="EXTERNAL")
    parser.add_argument("--evaluation-days", type=int, default=124)
    parser.add_argument("--allow-synthetic", action="store_true")
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    run(args.snapshot, args.version, args.source_kind, args.evaluation_days, args.allow_synthetic, args.activate)
