import copy
import hashlib
import json
from pathlib import Path
import socket
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
import uvicorn

from app import app
from src.features import MODEL_FEATURES
from src.forecasting import DemandModel
from src.prediction import load_model, predict_demo

ROOT = Path(__file__).resolve().parents[1]


class NegativeRegressor:
    feature_name_ = MODEL_FEATURES

    def predict(self, inputs, **_kwargs):
        return np.full(len(inputs), -2.0)


class InvalidRegressor(NegativeRegressor):
    def predict(self, inputs, **_kwargs):
        return np.full(len(inputs), np.nan)


class PredictionApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.socket = socket.socket()
        cls.socket.bind(("127.0.0.1", 0))
        cls.url = f"http://127.0.0.1:{cls.socket.getsockname()[1]}"
        cls.server = uvicorn.Server(uvicorn.Config(app, log_level="error"))
        cls.thread = threading.Thread(target=lambda: cls.server.run(sockets=[cls.socket]), daemon=True)
        cls.thread.start()
        for _ in range(100):
            if cls.server.started:
                break
            time.sleep(0.05)
        if not cls.server.started:
            raise RuntimeError("Prediction test service did not start")
        cls.saved_model = app.state.model
        if cls.saved_model is None:
            raise RuntimeError("Retained model failed startup loading")

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True
        cls.thread.join(timeout=5)
        cls.socket.close()

    def setUp(self):
        app.state.model = self.saved_model
        self.body = {"usage_mode": "SYNTHETIC_DEMO", "origin": "2026-01-30", "horizon_days": 30,
                     "series": [{"store_id": "d5202600-0000-4000-8000-000000000100",
                                 "product_id": "d5202600-0000-4000-8000-000000000200",
                                 "history": [{"date": day.strftime("%Y-%m-%d"), "quantity": float(i % 7)}
                                             for i, day in enumerate(pd.date_range("2026-01-01", periods=30))]}]}

    def request(self, body=None, path="/predict"):
        request = Request(self.url + path, data=None if body is None else json.dumps(body).encode(),
                          headers={"Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_saved_artifact_integrity_and_health(self):
        digest = hashlib.sha256((ROOT / "models/demand_model.joblib").read_bytes()).hexdigest()
        self.assertEqual(digest, "1823f5f9cf6be1086819db79ad40a5cf6b0c5dbb913367f7b9acaf8d911033b0")
        self.assertEqual(load_model(ROOT / "models").version, self.saved_model.version)
        self.assertEqual(self.request(path="/health"), (200, {"status": "ok", "service": "ml-service"}))

    def test_http_30_and_90_days_are_deterministic_and_preserve_prefix(self):
        status, month = self.request(self.body)
        self.assertEqual(status, 200)
        self.assertFalse(month["real_world_accuracy_verified"])
        self.assertEqual(month["usage_mode"], "SYNTHETIC_DEMO")
        daily = month["predictions"][0]["daily"]
        self.assertEqual(len(daily), 30)
        self.assertEqual(daily[-1]["date"], "2026-03-01")
        self.assertTrue(all(np.isfinite(p["quantity"]) and p["quantity"] >= 0 for p in daily))
        self.assertEqual(month, self.request(self.body)[1])
        self.body["horizon_days"] = 90
        status, quarter = self.request(self.body)
        self.assertEqual(status, 200)
        self.assertEqual(len(quarter["predictions"][0]["daily"]), 90)
        self.assertEqual(quarter["predictions"][0]["daily"][:30], daily)

    def test_invalid_contract_and_future_history_are_rejected(self):
        cases = []
        for field, value in [("horizon_days", True), ("horizon_days", 31), ("usage_mode", "PRODUCTION"), ("origin", "2026-02-30")]:
            body = copy.deepcopy(self.body); body[field] = value; cases.append(body)
        body = copy.deepcopy(self.body); body["series"] *= 2; cases.append(body)
        for field, value in [("date", "2026-01-31"), ("quantity", -1), ("quantity", True), ("quantity", "3")]:
            body = copy.deepcopy(self.body); body["series"][0]["history"][0][field] = value; cases.append(body)
        body = copy.deepcopy(self.body); body["weather"] = 27; cases.append(body)
        for body in cases:
            with self.subTest(body=body):
                self.assertEqual(self.request(body), (422, {"code": "INVALID_FORECAST_INPUT", "message": "INVALID_FORECAST_INPUT"}))

    def test_insufficient_and_duplicate_daily_history(self):
        self.body["series"][0]["history"].pop(0)
        self.assertEqual(self.request(self.body)[1]["code"], "INSUFFICIENT_HISTORY")
        self.body["series"][0]["history"].append(self.body["series"][0]["history"][-1])
        self.assertEqual(self.request(self.body)[1]["code"], "INVALID_FORECAST_INPUT")

    def test_negative_outputs_clipped_before_recursion(self):
        app.state.model = DemandModel("LightGBM", self.saved_model.version, NegativeRegressor())
        self.body["horizon_days"] = 90
        status, body = self.request(self.body)
        self.assertEqual(status, 200)
        self.assertEqual(body["negative_predictions_clipped"], 90)
        self.assertEqual(sum(p["quantity"] for p in body["predictions"][0]["daily"]), 0)

    def test_failures_do_not_return_predictions_or_internal_details(self):
        app.state.model = None
        self.assertEqual(self.request(self.body), (503, {"code": "MODEL_UNAVAILABLE", "message": "MODEL_UNAVAILABLE"}))
        app.state.model = DemandModel("LightGBM", self.saved_model.version, InvalidRegressor())
        self.assertEqual(self.request(self.body), (500, {"code": "PREDICTION_FAILED", "message": "PREDICTION_FAILED"}))

    def test_adapter_does_not_modify_history_or_benchmark_predictions(self):
        series = self.body["series"][0]
        history = pd.DataFrame([{"store_id": series["store_id"], "product_id": series["product_id"],
                                 "dt": pd.Timestamp(point["date"]), "sale_amount": point["quantity"]} for point in series["history"]])
        original = history.copy(deep=True)
        direct, _ = self.saved_model.predict(history, self.body["origin"], 30)
        extended, _ = predict_demo(self.saved_model, history, self.body["origin"], 90)
        pd.testing.assert_frame_equal(history, original)
        pd.testing.assert_frame_equal(extended.iloc[:30].reset_index(drop=True), direct, check_exact=True)


if __name__ == "__main__":
    unittest.main()
