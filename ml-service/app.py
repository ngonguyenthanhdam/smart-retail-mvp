from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

import pandas as pd
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

from src.forecasting import history_panel
from src.prediction import load_model, predict_demo
from src.quantity_model import ModelRegistry, public_metadata


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.quantity_registry = ModelRegistry()
    try:
        application.state.model = load_model(Path(__file__).resolve().parent / "models")
    except Exception:
        application.state.model = None
    yield


app = FastAPI(title="RetailSense ML Service", version="0.2.0", lifespan=lifespan)


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Observation(StrictBody):
    date: str
    quantity: Annotated[float, Field(strict=True, ge=0, lt=10_000_000_000, allow_inf_nan=False)]

    @field_validator("date")
    @classmethod
    def daily_date(cls, value: str) -> str:
        if len(value) != 10 or date.fromisoformat(value).isoformat() != value:
            raise ValueError("Expected an ISO calendar date")
        return value


class Series(StrictBody):
    store_id: UUID
    product_id: UUID
    history: Annotated[list[Observation], Field(min_length=1, max_length=366)]


class PredictRequest(StrictBody):
    usage_mode: Literal["SYNTHETIC_DEMO", "STORE_HISTORY"]
    origin: str
    horizon_days: StrictInt
    series: Annotated[list[Series], Field(min_length=1, max_length=100)]

    @field_validator("origin")
    @classmethod
    def origin_date(cls, value: str) -> str:
        return Observation.daily_date(value)

    @field_validator("horizon_days")
    @classmethod
    def horizon(cls, value: int) -> int:
        if not 1 <= value <= 124:
            raise ValueError("Choose 1 through 124 days")
        return value


def failure(code: str, status: int):
    return JSONResponse(status_code=status, content={"code": code, "message": code})


@app.exception_handler(RequestValidationError)
async def invalid_request(_request: Request, _error: RequestValidationError):
    return failure("INVALID_FORECAST_INPUT", 422)


@app.post("/predict", tags=["forecast"])
def predict(body: PredictRequest, request: Request):
    metadata = None
    if body.usage_mode == "STORE_HISTORY":
        try:
            model, metadata = request.app.state.quantity_registry.get()
        except Exception:
            return failure("MODEL_UNAVAILABLE", 503)
    else:
        if body.horizon_days not in (7, 30, 90):
            return failure("INVALID_FORECAST_INPUT", 422)
        model = getattr(request.app.state, "model", None)
    if model is None:
        return failure("MODEL_UNAVAILABLE", 503)
    keys = [(str(series.store_id), str(series.product_id)) for series in body.series]
    if len(keys) != len(set(keys)):
        return failure("INVALID_FORECAST_INPUT", 422)
    history = pd.DataFrame([
        {"store_id": str(series.store_id), "product_id": str(series.product_id),
         "dt": pd.Timestamp(point.date), "sale_amount": point.quantity}
        for series in body.series for point in series.history
    ])
    try:
        history_panel(history, body.origin)
    except ValueError as exc:
        return failure("INSUFFICIENT_HISTORY" if str(exc).startswith("INSUFFICIENT_HISTORY") else "INVALID_FORECAST_INPUT", 422)
    try:
        if metadata is None:
            frame, clipped = predict_demo(model, history, body.origin, body.horizon_days)
        else:
            frame, diagnostics = model.predict(history, body.origin, body.horizon_days)
            clipped = diagnostics["negative_predictions_clipped"]
        predictions = []
        for (store, product), group in frame.groupby(["store_id", "product_id"], sort=True):
            predictions.append({"store_id": store, "product_id": product,
                "daily": [{"date": row.dt.strftime("%Y-%m-%d"), "quantity": float(row.prediction)} for row in group.itertuples()]})
        return {"model_version": model.version, "algorithm": model.algorithm, "usage_mode": body.usage_mode,
                "model_target_space": model.target_space, "real_world_accuracy_verified": False,
                 "operational_units_supported": metadata is not None,
                "origin": body.origin, "horizon_days": body.horizon_days,
                "negative_predictions_clipped": clipped, "predictions": predictions}
    except Exception:
        return failure("PREDICTION_FAILED", 500)


@app.get("/model-info", tags=["forecast"])
def model_info(request: Request):
    try:
        _, metadata = request.app.state.quantity_registry.get()
        return public_metadata(metadata)
    except Exception:
        return failure("MODEL_UNAVAILABLE", 503)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["ml-service"] = "ml-service"


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health() -> HealthResponse:
    return HealthResponse()
