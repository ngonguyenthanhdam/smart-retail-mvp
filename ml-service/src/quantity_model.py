"""Quantity-space forecasting and verified, atomically activated local model versions."""

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .features import MODEL_FEATURES
from .forecasting import history_panel, step_features

TARGET_SPACE = "base_unit_quantity"
MAX_HORIZON = 124
ALGORITHMS = ("SeasonalNaive", "RollingMean28", "LightGBM")
ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


@dataclass
class QuantityModel:
    algorithm: str
    version: str
    regressor: Any = None
    target_space: str = TARGET_SPACE

    def predict(self, history: pd.DataFrame, origin: str, horizon: int):
        if isinstance(horizon, bool) or not isinstance(horizon, int) or not 1 <= horizon <= MAX_HORIZON:
            raise ValueError("Quantity forecast horizon must be 1..124 days")
        if self.algorithm not in ALGORITHMS or self.target_space != TARGET_SPACE:
            raise ValueError("Unsupported quantity model")
        panel = history_panel(history, origin)
        if self.algorithm == "LightGBM" and (self.regressor is None or list(self.regressor.feature_name_) != MODEL_FEATURES):
            raise ValueError("Quantity model feature contract mismatch")
        buffer = np.empty((len(panel), 30 + horizon), dtype=float)
        buffer[:, :30] = panel.to_numpy()
        fixed_mean = buffer[:, 2:30].mean(axis=1)
        clipped = 0
        dates = pd.date_range(pd.Timestamp(origin) + pd.Timedelta(days=1), periods=horizon)
        for offset, day in enumerate(dates):
            end = 30 + offset
            if self.algorithm == "SeasonalNaive":
                values = buffer[:, end - 7].copy()
            elif self.algorithm == "RollingMean28":
                values = fixed_mean.copy()
            else:
                values = np.asarray(self.regressor.predict(step_features(buffer[:, end - 30:end], day), validate_features=True), dtype=float)
            if values.shape != (len(panel),) or not np.isfinite(values).all():
                raise ValueError("Invalid quantity prediction")
            clipped += int((values < 0).sum())
            buffer[:, end] = np.maximum(values, 0)
        result = panel.index.to_frame(index=False).loc[lambda x: x.index.repeat(horizon)].reset_index(drop=True)
        result["dt"] = np.tile(dates.to_numpy(), len(panel))
        result["prediction"] = buffer[:, 30:].reshape(-1)
        return result, {"negative_predictions_clipped": clipped, "pairs": len(panel), "horizon_days": horizon}


def version_path(version: str, model_root: Path = ROOT / "models") -> Path:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", version) or ".." in version:
        raise ValueError("Invalid model version")
    return model_root / "operational" / version


def load_version(version: str, model_root: Path = ROOT / "models"):
    directory = version_path(version, model_root)
    metadata_path = directory / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    artifact = directory / "model.joblib"
    if sha256(artifact) != metadata["artifact"]["sha256"]:
        raise ValueError("Quantity model integrity failure")
    # Only locally trained trusted artifacts are supported; no serialized upload endpoint.
    model = joblib.load(artifact)
    if (not isinstance(model, QuantityModel) or model.version != version or metadata["model_version"] != version
            or model.target_space != TARGET_SPACE or metadata["target_space"] != TARGET_SPACE
            or metadata["algorithm"] != model.algorithm or metadata["features"] != MODEL_FEATURES
            or (model.algorithm == "LightGBM" and list(model.regressor.feature_name_) != MODEL_FEATURES)):
        raise ValueError("Quantity model metadata contract mismatch")
    return model, metadata


def require_operational_evidence(metadata: dict):
    if metadata.get("contains_synthetic"):
        raise ValueError("Synthetic experiments are not eligible for operational activation")
    validation = metadata.get("validation", {})
    key = str(MAX_HORIZON)
    if (MAX_HORIZON not in validation.get("evaluated_horizons_days", [])
            or not validation.get("independent_test")
            or any(validation.get(split, {}).get(key, {}).get("horizon_days") != MAX_HORIZON
                   for split in ("validation", "test"))):
        raise ValueError("Operational activation requires independent validation and test evidence for 124 days; shorter evaluations are offline reports only")
    if not metadata.get("activation_eligible"):
        raise ValueError("This experiment is not eligible for operational activation")


def activate(version: str, model_root: Path = ROOT / "models"):
    _, metadata = load_version(version, model_root)
    require_operational_evidence(metadata)
    pointer = {"model_version": version, "metadata_sha256": sha256(version_path(version, model_root) / "metadata.json")}
    destination = model_root / "active-model.json"
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(json.dumps(pointer, indent=2) + "\n", encoding="utf-8")
    temporary.replace(destination)
    return pointer


class ModelRegistry:
    def __init__(self, model_root: Path = ROOT / "models"):
        self.model_root = model_root
        self.signature = None
        self.current = None

    def get(self):
        pointer_bytes = (self.model_root / "active-model.json").read_bytes()
        signature = hashlib.sha256(pointer_bytes).hexdigest()
        if signature != self.signature:
            pointer = json.loads(pointer_bytes)
            metadata_path = version_path(pointer["model_version"], self.model_root) / "metadata.json"
            if sha256(metadata_path) != pointer["metadata_sha256"]:
                raise ValueError("Active model metadata integrity failure")
            current = load_version(pointer["model_version"], self.model_root)
            require_operational_evidence(current[1])
            self.current, self.signature = current, signature
        return self.current


def public_metadata(metadata: dict) -> dict:
    return {"model_version": metadata["model_version"], "algorithm": metadata["algorithm"],
            "target_space": TARGET_SPACE, "model_target_space": TARGET_SPACE, "usage_mode": "STORE_HISTORY",
            "minimum_history_days": 30, "forecast_horizon_limit_days": MAX_HORIZON,
            "operational_units_supported": True,
            "real_world_accuracy_verified": metadata["real_world_accuracy_verified"],
            "supported_units": metadata.get("supported_units", metadata["training"]["units"]),
            "unit_validation_note": metadata.get("unit_validation_note"),
            "selection_reason": metadata.get("selection_reason"),
            "trained_candidate": metadata.get("trained_candidate"),
            "validation_source": metadata["validation_source"], "training": metadata["training"],
            "validation": metadata["validation"], "limitations": metadata["limitations"]}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Activate or roll back to a previously validated local model version")
    parser.add_argument("--activate", required=True)
    print(json.dumps(activate(parser.parse_args().activate), indent=2))
