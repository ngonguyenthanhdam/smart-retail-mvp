from pathlib import Path
import tempfile
import unittest

import joblib
import numpy as np
import pandas as pd
from pandas.testing import assert_frame_equal

from src.evaluation import metrics, score_predictions, select_algorithm
from src.features import MODEL_FEATURES, build_features
from src.forecasting import DemandModel, history_panel, step_features
from src.train import fit_lightgbm, forecast_window, load_config


def observations(days=65):
    rows = []
    for product in [1, 2]:
        for offset, date in enumerate(pd.date_range("2024-01-01", periods=days)):
            rows.append({"store_id": 10, "product_id": product, "dt": date,
                         "sale_amount": float(product * 10 + offset % 7), "stock_hour6_22_cnt": offset % 2})
    return pd.DataFrame(rows)


class IncrementRegressor:
    feature_name_ = MODEL_FEATURES

    def predict(self, features, **kwargs):
        if list(features.columns) != MODEL_FEATURES:
            raise AssertionError("Unexpected model inputs")
        return features.lag_1.to_numpy() + 1


class InvalidRegressor:
    feature_name_ = MODEL_FEATURES

    def __init__(self, value):
        self.value = value

    def predict(self, features, **kwargs):
        return np.full(len(features), self.value)


class TrainingTests(unittest.TestCase):
    def test_known_metrics_and_zero_denominator(self):
        result = metrics(np.array([0, 2, 4]), np.array([1, 1, 7]))
        self.assertAlmostEqual(result["WAPE"], 5 / 6)
        self.assertAlmostEqual(result["MAE"], 5 / 3)
        self.assertAlmostEqual(result["RMSE"], np.sqrt(11 / 3))
        self.assertIsNone(metrics(np.zeros(2), np.ones(2))["WAPE"])
        for actual, prediction in [([], []), ([1], [1, 2]), ([np.nan], [0]), ([-1], [0]), ([1], [np.inf])]:
            with self.assertRaises(ValueError):
                metrics(np.array(actual), np.array(prediction))

    def test_scoring_key_alignment_totals_and_stockout_slices(self):
        actual = observations(2).query("product_id == 1").copy()
        prediction = actual[["store_id", "product_id", "dt"]].copy()
        prediction["prediction"] = actual.sale_amount.to_numpy() + np.array([1, -1])
        score, _ = score_predictions(prediction.iloc[::-1], actual)
        self.assertEqual(score["daily"]["MAE"], 1)
        self.assertEqual(score["period_totals"]["MAE"], 0)
        self.assertEqual(score["stockout_slices"]["some_stockout"]["rows"], 1)
        with self.assertRaisesRegex(ValueError, "keys differ"):
            score_predictions(prediction.iloc[:1], actual)
        with self.assertRaises(ValueError):
            score_predictions(pd.concat([prediction, prediction]), actual)

    def test_seasonal_naive_repeats_last_week_through_day_30(self):
        data = observations(30)
        model = DemandModel("SeasonalNaive", "test-v1")
        predicted, diagnostics = model.predict(data, "2024-01-30", 30)
        self.assertEqual(diagnostics["pairs"], 2)
        self.assertEqual(len(predicted), 60)
        for product, rows in predicted.groupby("product_id"):
            last_week = data.query("product_id == @product").tail(7).sale_amount.to_numpy()
            np.testing.assert_array_equal(rows.prediction, np.resize(last_week, 30))

    def test_recursive_predictions_do_not_use_future_actuals_or_context(self):
        data = observations()
        model = DemandModel("LightGBM", "test-v1", IncrementRegressor())
        predicted, _ = forecast_window(model, data, "2024-01-30", 30)
        changed = data.copy()
        changed.loc[changed.dt > "2024-01-30", "sale_amount"] = 99999
        changed["stock_hour6_22_cnt"] = 16
        changed["discount"] = 0.5
        again, _ = forecast_window(model, changed, "2024-01-30", 30)
        assert_frame_equal(predicted, again)
        last = data.loc[data.product_id.eq(1) & data.dt.eq(pd.Timestamp("2024-01-30")), "sale_amount"].iloc[0]
        np.testing.assert_array_equal(predicted.query("product_id == 1").prediction, last + np.arange(1, 31))

    def test_batch_features_match_training_features(self):
        data = observations(31)
        prepared = build_features(data)
        panel = history_panel(data.loc[data.dt <= "2024-01-30"], "2024-01-30")
        actual = step_features(panel.to_numpy(), pd.Timestamp("2024-01-31"))
        expected = prepared.loc[prepared.dt == "2024-01-31", MODEL_FEATURES]
        np.testing.assert_allclose(actual.to_numpy(), expected.to_numpy(), rtol=0, atol=1e-12)

    def test_invalid_history_and_horizon_rejected(self):
        data = observations(30)
        model = DemandModel("SeasonalNaive", "test-v1")
        for changed in [data.iloc[1:], pd.concat([data, data.iloc[:1]]),
                        data.assign(sale_amount=np.nan), data.assign(sale_amount=-1),
                        data.assign(dt=data.dt + pd.Timedelta(days=1))]:
            with self.assertRaises(ValueError):
                model.predict(changed, "2024-01-30", 7)
        for horizon in [True, 0, 31, 90, 1.5]:
            with self.assertRaises(ValueError):
                model.predict(data, "2024-01-30", horizon)
        with self.assertRaises(ValueError):
            DemandModel("SeasonalNaive", "v", target_space="CAN").predict(data, "2024-01-30", 7)

    def test_nonfinite_outputs_fail_and_negative_outputs_clip(self):
        data = observations(30)
        with self.assertRaisesRegex(ValueError, "non-finite"):
            DemandModel("LightGBM", "test-v1", InvalidRegressor(np.inf)).predict(data, "2024-01-30", 7)
        prediction, stats = DemandModel("LightGBM", "test-v1", InvalidRegressor(-1)).predict(data, "2024-01-30", 7)
        self.assertTrue(prediction.prediction.eq(0).all())
        self.assertEqual(stats["negative_predictions_clipped"], 14)

    def test_selection_is_validation_only_and_ties_favor_baseline(self):
        baseline = {"daily": {"WAPE": .2, "MAE": 1, "RMSE": 2}}
        better = {"daily": {"WAPE": .1, "MAE": 1, "RMSE": 2}}
        self.assertEqual(select_algorithm({"SeasonalNaive": baseline, "LightGBM": better}), "LightGBM")
        self.assertEqual(select_algorithm({"SeasonalNaive": baseline, "LightGBM": baseline}), "SeasonalNaive")
        with self.assertRaises(ValueError):
            select_algorithm({"SeasonalNaive": baseline, "LightGBM": better, "test": better})

    def test_real_model_fit_uses_only_cutoff_and_roundtrips_artifact(self):
        data = observations()
        features = build_features(data)
        params = {**load_config()["lightgbm"], "n_estimators": 10, "min_child_samples": 2, "n_jobs": 1}
        regressor, details = fit_lightgbm(features, "2024-01-01", "2024-02-14", params)
        self.assertEqual(details["rows"], 30)
        self.assertEqual(details["last_target"], "2024-02-14")
        self.assertEqual(regressor.feature_name_, MODEL_FEATURES)
        changed = features.copy()
        changed.loc[changed.dt > "2024-02-14", "sale_amount"] = 99999
        other, _ = fit_lightgbm(changed, "2024-01-01", "2024-02-14", params)
        np.testing.assert_array_equal(regressor.predict(features[MODEL_FEATURES]), other.predict(features[MODEL_FEATURES]))
        model = DemandModel("LightGBM", "synthetic-test-v1", regressor)
        expected, _ = forecast_window(model, data, "2024-02-14", 7)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "model.joblib"
            joblib.dump(model, path)
            loaded = joblib.load(path)
            actual, _ = forecast_window(loaded, data, "2024-02-14", 7)
            self.assertEqual(loaded.version, "synthetic-test-v1")
            assert_frame_equal(actual, expected, check_exact=True)


if __name__ == "__main__":
    unittest.main()
