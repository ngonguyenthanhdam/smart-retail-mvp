import copy
import json
from pathlib import Path
import socket
import tempfile
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
import pandas as pd
import uvicorn

from app import app
from src.quantity_model import ModelRegistry, QuantityModel, activate, load_version, sha256, version_path
from src.train_quantity import load_snapshot, metric, run


class QuantityModelTests(unittest.TestCase):
    def history(self):
        return pd.DataFrame({"store_id": ["store"] * 30, "product_id": ["product"] * 30,
                             "dt": pd.date_range("2026-01-01", periods=30), "sale_amount": np.arange(30) % 7})

    def test_baselines_recurse_without_future_actuals_for_calendar_lengths(self):
        history = self.history()
        original = history.copy(deep=True)
        for algorithm in ["SeasonalNaive", "RollingMean28"]:
            model = QuantityModel(algorithm, "test")
            short, _ = model.predict(history, "2026-01-30", 31)
            long, _ = model.predict(history, "2026-01-30", 124)
            pd.testing.assert_frame_equal(short, long.iloc[:31].reset_index(drop=True))
            self.assertEqual(long.dt.max(), pd.Timestamp("2026-06-03"))
            self.assertTrue(np.isfinite(long.prediction).all())
        pd.testing.assert_frame_equal(history, original)
        with self.assertRaises(ValueError):
            QuantityModel("RollingMean28", "test").predict(history, "2026-01-29", 31)

    def test_snapshot_rejects_unknown_missing_and_inconsistent_observations(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "snapshot.csv"
            rows = pd.DataFrame({"date": ["2025-01-01", "2025-01-02"], "store_id": ["s"] * 2,
                                 "product_id": ["p"] * 2, "quantity": [0, 2], "unit_code": ["KG"] * 2,
                                 "source": ["STORE_HISTORY"] * 2})
            rows.to_csv(path, index=False)
            self.assertEqual(load_snapshot(path).sale_amount.tolist(), [0, 2])
            for column, values in [("quantity", [None, 2]), ("quantity", [-1, 2]),
                                   ("unit_code", ["KG", "PCS"]), ("source", ["SYNTHETIC", "SYNTHETIC"]),
                                   ("date", ["2025-01-01", "2025-01-01"])]:
                changed = rows.copy(); changed[column] = values; changed.to_csv(path, index=False)
                with self.subTest(column=column, values=values), self.assertRaises(ValueError):
                    load_snapshot(path)

    def test_metric_zero_denominator_and_exact_period_values(self):
        self.assertIsNone(metric([0, 0], [1, 0])["wape"])
        values = metric([2, 6], [3, 3])
        self.assertEqual(values["wape"], 0.5)
        self.assertEqual(values["mae"], 2)
        self.assertEqual(values["bias"], -0.25)

    def test_training_versions_holdout_and_activation_integrity(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dates = pd.date_range("2024-01-01", periods=320)
            snapshot = root / "snapshot.csv"
            pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "store_id": "s", "product_id": "p",
                          "quantity": [float(i % 7 + 1) for i in range(320)], "unit_code": "PCS",
                          "source": "STORE_HISTORY"}).to_csv(snapshot, index=False)
            metadata = run(snapshot, "store-test", "STORE_HISTORY", 124, model_root=root / "models", activate_model=True)
            self.assertTrue(metadata["validation"]["selection"]["selected_before_test"])
            self.assertLess(metadata["training"]["initial"]["last_target"], metadata["validation"]["test"]["30"]["start"])
            registry = ModelRegistry(root / "models")
            self.assertEqual(registry.get()[0].version, "store-test")
            for filename in ("metadata.json", "protocol.json", "selection.json", "evaluation.json"):
                self.assertNotIn(b"\r", (version_path("store-test", root / "models") / filename).read_bytes())
            self.assertNotIn(b"\r", (root / "models/active-model.json").read_bytes())
            self.assertFalse(metadata["real_world_accuracy_verified"])
            changed = pd.read_csv(snapshot)
            changed.loc[changed.index[-124:], "quantity"] += 1000
            changed.to_csv(snapshot, index=False)
            repeated = run(snapshot, "changed-test-targets", "STORE_HISTORY", 124, model_root=root / "models")
            self.assertEqual(metadata["validation"]["selection"]["scores"], repeated["validation"]["selection"]["scores"])
            first = load_version("store-test", root / "models")[0]
            second = load_version("changed-test-targets", root / "models")[0]
            history = QuantityModelTests().history()
            pd.testing.assert_frame_equal(first.predict(history, "2026-01-30", 31)[0], second.predict(history, "2026-01-30", 31)[0])
            with self.assertRaises(ValueError):
                run(snapshot, "store-test", "STORE_HISTORY", 30, model_root=root / "models")
            artifact = version_path("store-test", root / "models") / "model.joblib"
            artifact.write_bytes(artifact.read_bytes() + b"corruption")
            with self.assertRaises(ValueError):
                ModelRegistry(root / "models").get()
            with self.assertRaises(ValueError):
                activate("../outside", root / "models")

    def test_short_evaluation_is_report_only_and_cannot_replace_active_model(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = root / "snapshot.csv"
            dates = pd.date_range("2024-01-01", periods=160)
            pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "store_id": "s", "product_id": "p",
                          "quantity": np.arange(160) % 7 + 1, "unit_code": "PCS",
                          "source": "STORE_HISTORY"}).to_csv(snapshot, index=False)
            model_root = root / "models"
            model_root.mkdir()
            pointer = model_root / "active-model.json"
            previous = b'{"model_version": "previous-version"}\n'
            pointer.write_bytes(previous)
            with self.assertRaisesRegex(ValueError, "124 days.*offline reports only"):
                run(snapshot, "short-report", "STORE_HISTORY", 30, model_root=model_root, activate_model=True)
            self.assertEqual(pointer.read_bytes(), previous)
            directory = version_path("short-report", model_root)
            metadata_path = directory / "metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            self.assertFalse(metadata["activation_eligible"])
            self.assertEqual(metadata["validation"]["evaluated_horizons_days"], [7, 30])
            self.assertTrue((directory / "evaluation.json").exists())
            # Older metadata could mark a 30-day experiment eligible. Both activation
            # and loading must check the recorded evidence, not just this flag.
            metadata["activation_eligible"] = True
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "124 days"):
                activate("short-report", model_root)
            self.assertEqual(pointer.read_bytes(), previous)
            pointer.write_text(json.dumps({"model_version": "short-report", "metadata_sha256": sha256(metadata_path)}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "124 days"):
                ModelRegistry(model_root).get()

    def test_synthetic_experiment_cannot_activate_and_short_coverage_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / "snapshot.csv"
            dates = pd.date_range("2024-01-01", periods=160)
            data = pd.DataFrame({"date": dates.strftime("%Y-%m-%d"), "store_id": "s", "product_id": "p",
                                 "quantity": np.arange(160) % 7 + 1, "unit_code": "PCS", "source": "SYNTHETIC"})
            data.to_csv(path, index=False)
            model_root = root / "models"
            result = run(path, "synthetic", evaluation_days=30, allow_synthetic=True, model_root=model_root)
            self.assertFalse(result["activation_eligible"])
            with self.assertRaises(ValueError):
                activate("synthetic", model_root)
            data.iloc[-60:].to_csv(path, index=False)
            with self.assertRaises(ValueError):
                run(path, "too-short", evaluation_days=30, allow_synthetic=True, model_root=model_root)


class QuantityApiTests(unittest.TestCase):
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
            raise RuntimeError("Operational prediction test server did not start")

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True
        cls.thread.join(timeout=5)
        cls.socket.close()

    def setUp(self):
        app.state.quantity_registry = ModelRegistry()
        self.body = {"usage_mode": "STORE_HISTORY", "origin": "2026-01-30", "horizon_days": 31,
                     "series": [{"store_id": "d5202600-0000-4000-8000-000000000100",
                                 "product_id": "d5202600-0000-4000-8000-000000000200",
                                 "history": [{"date": day.strftime("%Y-%m-%d"), "quantity": float(i % 7 + 1)}
                                             for i, day in enumerate(pd.date_range("2026-01-01", periods=30))]}]}

    def request(self, body=None, path="/predict"):
        request = Request(self.url + path, data=None if body is None else json.dumps(body).encode(),
                          headers={"Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read())
        except HTTPError as error:
            return error.code, json.loads(error.read())

    def test_dynamic_model_info_and_quantity_predictions(self):
        status, info = self.request(path="/model-info")
        self.assertEqual(status, 200)
        self.assertEqual(info["target_space"], "base_unit_quantity")
        self.assertFalse(info["real_world_accuracy_verified"])
        self.assertTrue(info["operational_units_supported"])
        self.assertIn(124, info["validation"]["evaluated_horizons_days"])
        for horizon in [1, 28, 29, 30, 31, 90, 124]:
            self.body["horizon_days"] = horizon
            status, result = self.request(self.body)
            self.assertEqual(status, 200)
            self.assertEqual(result["model_version"], info["model_version"])
            self.assertEqual(result["usage_mode"], "STORE_HISTORY")
            self.assertEqual(len(result["predictions"][0]["daily"]), horizon)
            self.assertTrue(all(point["quantity"] >= 0 for point in result["predictions"][0]["daily"]))

    def test_invalid_or_incomplete_store_history_and_missing_model(self):
        for horizon in [0, 125, True, 31.5]:
            body = copy.deepcopy(self.body); body["horizon_days"] = horizon
            self.assertEqual(self.request(body)[0], 422)
        self.body["series"][0]["history"].pop(0)
        self.assertEqual(self.request(self.body)[1]["code"], "INSUFFICIENT_HISTORY")
        with tempfile.TemporaryDirectory() as temporary:
            app.state.quantity_registry = ModelRegistry(Path(temporary))
            self.assertEqual(self.request(path="/model-info")[0], 503)
            self.assertEqual(self.request(self.body)[0], 503)


if __name__ == "__main__":
    unittest.main()
