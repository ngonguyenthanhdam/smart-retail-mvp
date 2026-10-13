from pathlib import Path
import tempfile
import unittest

import numpy as np
import pandas as pd

from src.eda import inspect_hourly


class HourlyAuditTests(unittest.TestCase):
    def audit(self, sales, statuses, total=2.0, count=1):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "sample.parquet"
            pd.DataFrame({"sale_amount": [total], "stock_hour6_22_cnt": [count],
                          "hours_sale": [sales], "hours_stock_status": [statuses]}).to_parquet(path)
            return inspect_hourly(path)

    def test_stockout_mask_and_daily_total_semantics(self):
        sales, status = np.zeros(24), np.zeros(24, dtype=int)
        sales[8] = 2
        status[[0, 7, 22, 23]] = 1
        stats = self.audit(sales, status)
        self.assertEqual(stats["stockout_hours_6_to_22"], 1)
        self.assertEqual(stats["total_hours_6_to_22"], 16)
        self.assertEqual(stats["stock_count_6_to_22_exclusive_mismatch_rows"], 0)
        self.assertEqual(stats["daily_hourly_sum_mismatch_rows"], 0)
        self.assertEqual(stats["invalid_hourly_status_rows"], 0)

    def test_malformed_lists_and_inconsistent_data_are_reported(self):
        with self.assertRaisesRegex(ValueError, "Invalid hourly arrays"):
            self.audit(np.zeros(23), np.zeros(24, dtype=int))
        sales, status = np.zeros(24), np.zeros(24, dtype=int)
        sales[1] = -2
        status[1] = 2
        stats = self.audit(sales, status)
        self.assertEqual(stats["invalid_hourly_sales_rows"], 1)
        self.assertEqual(stats["invalid_hourly_status_rows"], 1)
        self.assertEqual(stats["daily_hourly_sum_mismatch_rows"], 1)
        self.assertEqual(stats["stock_count_6_to_22_exclusive_mismatch_rows"], 1)


if __name__ == "__main__":
    unittest.main()
