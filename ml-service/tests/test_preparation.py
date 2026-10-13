from pathlib import Path
import tempfile
import unittest

import numpy as np
import pandas as pd
from pandas.testing import assert_frame_equal

from src.dataset import verify_file
from src.features import MODEL_FEATURES, assign_split, build_features
from src.preprocessing import CONTEXT, IDS, clean_daily


def daily(days=45, product=1):
    data = pd.DataFrame({"dt": pd.date_range("2024-01-01", periods=days).strftime("%Y-%m-%d"),
                         "sale_amount": np.arange(days, dtype=float)})
    for column in IDS:
        data[column] = product if column == "product_id" else 0
    for column in CONTEXT:
        data[column] = 1.0 if column == "discount" else 0
    return data


class PreparationTests(unittest.TestCase):
    def test_parquet_dates_and_exact_duplicates(self):
        data = daily()
        data["hours_sale"] = [np.zeros(24)] * len(data)
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "sample.parquet"
            pd.concat([data, data.iloc[[0]]]).to_parquet(path, index=False)
            clean, stats = clean_daily(pd.read_parquet(path))
        self.assertEqual(stats["exact_duplicates_removed"], 1)
        self.assertEqual(len(clean), 45)
        self.assertEqual(clean.dt.iloc[0], pd.Timestamp("2024-01-01"))

    def test_conflicting_same_day_is_not_summed(self):
        data = daily()
        extra = data.iloc[[0]].assign(sale_amount=900)
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            clean_daily(pd.concat([data, extra]))
        data = daily()
        data.loc[0, "discount"] = 1.1
        extra = data.iloc[[0]].assign(discount=1.2)
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            clean_daily(pd.concat([data, extra]))
        data["hours_sale"] = [np.zeros(24)] * len(data)
        extra = data.iloc[[0]].copy()
        extra.at[0, "hours_sale"] = np.ones(24)
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            clean_daily(pd.concat([data, extra]))

    def test_missing_target_and_optional_context_stay_unknown(self):
        data = daily()
        data.loc[10, "sale_amount"] = np.nan
        data.loc[2, "avg_temperature"] = np.nan
        data.loc[3, "discount"] = 1.088
        clean, stats = clean_daily(data)
        self.assertEqual(len(clean), len(data))
        self.assertTrue(pd.isna(clean.loc[10, "sale_amount"]))
        self.assertTrue(pd.isna(clean.loc[2, "avg_temperature"]))
        self.assertTrue(pd.isna(clean.loc[3, "discount"]))
        self.assertEqual(stats["invalid_context_to_na"]["discount"], 1)
        features = build_features(clean)
        self.assertFalse(features.loc[40, "training_eligible"])
        self.assertTrue(features.loc[41, "training_eligible"])

    def test_invalid_target_ids_and_dates_stop_processing(self):
        for column, value in [("sale_amount", -1), ("sale_amount", np.inf),
                              ("sale_amount", "abc"), ("store_id", np.nan),
                              ("dt", "2024-02-30"), ("dt", "2024-1-01")]:
            with self.subTest(column=column, value=value):
                data = daily().astype({column: "object"})
                data.loc[0, column] = value
                with self.assertRaises(ValueError):
                    clean_daily(data)

    def test_feature_values_and_pair_isolation(self):
        data = pd.concat([daily(), daily(product=2).assign(sale_amount=1000)], ignore_index=True)
        clean, _ = clean_daily(data.sample(frac=1, random_state=7))
        features = build_features(clean)
        row = features.query("product_id == 1").iloc[30]
        self.assertEqual([row[f"lag_{n}"] for n in [1, 7, 14, 30]], [29, 23, 16, 0])
        self.assertEqual(row.rolling_mean_7, 26)
        self.assertEqual(row.rolling_mean_14, 22.5)
        self.assertEqual(row.rolling_mean_30, 14.5)
        other = features.query("product_id == 2")
        self.assertTrue(other.iloc[:30].training_eligible.eq(False).all())
        self.assertEqual(other.iloc[30].rolling_mean_30, 1000)

    def test_future_and_current_targets_do_not_change_earlier_features(self):
        clean, _ = clean_daily(daily())
        original = build_features(clean)
        cutoff = pd.Timestamp("2024-02-05")
        changed = clean.copy()
        changed.loc[changed.dt >= cutoff, "sale_amount"] = 99999
        actual = build_features(changed)
        cols = ["dt"] + MODEL_FEATURES
        assert_frame_equal(original.loc[original.dt <= cutoff, cols], actual.loc[actual.dt <= cutoff, cols])

    def test_calendar_gap_is_not_zero_and_lags_use_dates(self):
        clean, _ = clean_daily(daily().drop(index=10))
        features = build_features(clean).set_index("dt")
        self.assertTrue(pd.isna(features.loc["2024-01-12", "lag_1"]))
        self.assertEqual(features.loc["2024-01-12", "lag_7"], 4)
        self.assertTrue(pd.isna(features.loc["2024-01-17", "rolling_mean_7"]))
        self.assertEqual(features.loc["2024-01-19", "rolling_mean_7"], 14)
        self.assertFalse(features.loc["2024-02-10", "training_eligible"])
        self.assertTrue(features.loc["2024-02-11", "training_eligible"])

    def test_chronological_boundaries_remain_disjoint(self):
        dates = pd.Series(pd.date_range("2024-03-28", "2024-07-02"))
        labels = assign_split(dates, "2024-05-26", "2024-06-25")
        self.assertEqual(labels.value_counts().to_dict(), {"train": 60, "validation": 30, "test": 7})
        self.assertLess(dates[labels == "train"].max(), dates[labels == "validation"].min())
        self.assertLess(dates[labels == "validation"].max(), dates[labels == "test"].min())
        with self.assertRaises(ValueError):
            assign_split(dates, "2024-06-25", "2024-05-26")

    def test_source_integrity_rejects_changed_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "sample.parquet"
            path.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "checksum"):
                verify_file(path, {"bytes": 7, "sha256": "0" * 64})

    def test_missing_required_columns_rejected(self):
        with self.assertRaisesRegex(ValueError, "Missing columns"):
            clean_daily(daily().drop(columns="sale_amount"))


if __name__ == "__main__":
    unittest.main()
