"""Synthetic integration adapter; physical-unit forecasting accuracy is unverified."""

import hashlib
import json
from pathlib import Path

import joblib
import pandas as pd

from .features import MODEL_FEATURES
from .forecasting import DemandModel, TARGET_SPACE, history_panel

MODEL_VERSION = "freshretail-demand-v1-lightgbm"
USAGE_MODE = "SYNTHETIC_DEMO"


def load_model(directory: Path) -> DemandModel:
    metadata = json.loads((directory / "model_metadata.json").read_text())
    artifact = directory / "demand_model.joblib"
    if hashlib.sha256(artifact.read_bytes()).hexdigest() != metadata["artifact"]["sha256"]:
        raise ValueError("Model integrity check failed")
    model = joblib.load(artifact)
    if (not isinstance(model, DemandModel) or model.version != MODEL_VERSION
            or model.algorithm != "LightGBM" or model.target_space != TARGET_SPACE
            or metadata["features"] != MODEL_FEATURES
            or list(model.regressor.feature_name_) != MODEL_FEATURES):
        raise ValueError("Model contract mismatch")
    return model


def predict_demo(model: DemandModel, history: pd.DataFrame, origin: str, horizon: int):
    """Extend recursion without changing benchmark code, feature order or saved weights.

    `sale_amount` holds synthetic input quantities here, with no scaling coefficient.
    Direct numeric transfer is an experiment, not proof of physical-unit calibration.
    """
    if isinstance(horizon, bool) or horizon not in (7, 30, 90):
        raise ValueError("Choose a 7, 30 or 90 day horizon")
    history_panel(history, origin)
    frames = []
    cursor = pd.Timestamp(origin)
    working = history.copy()
    clipped = 0
    for offset in range(0, horizon, 30):
        block, diagnostics = model.predict(working, cursor.strftime("%Y-%m-%d"), min(30, horizon - offset))
        frames.append(block)
        clipped += diagnostics["negative_predictions_clipped"]
        cursor = block.dt.max()
        working = pd.concat([working, block.rename(columns={"prediction": "sale_amount"})], ignore_index=True)
        working = working.loc[working.dt >= cursor - pd.Timedelta(days=29)].copy()
    return pd.concat(frames, ignore_index=True).sort_values(["store_id", "product_id", "dt"]).reset_index(drop=True), clipped
