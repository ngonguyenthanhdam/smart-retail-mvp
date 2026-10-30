import json
import unittest

import pandas as pd

from src.ai_diagnostics import feature_diagnostics


class DiagnosticsTests(unittest.TestCase):
    def frame(self):
        rows = []
        for unit, scale in [('PCS', 1), ('KG', .1)]:
            for i, day in enumerate(pd.date_range('2026-01-01', periods=140)):
                rows.append({'store_id': 'S1', 'product_id': unit, 'unit_code': unit,
                             'dt': day, 'sale_amount': scale * (i % 7)})
        return pd.DataFrame(rows)

    def test_train_only_units_and_true_missing_warmup(self):
        data = self.frame()
        original = data.copy(deep=True)
        report = feature_diagnostics(data, '2026-03-21')
        pd.testing.assert_frame_equal(data, original)
        self.assertEqual(set(report['by_unit']), {'PCS', 'KG'})
        unit = report['by_unit']['PCS']
        self.assertEqual(unit['rows'], 80)
        self.assertEqual(unit['eligible_rows'], 50)
        self.assertEqual(len(unit['missing']), 24)
        self.assertEqual(unit['missing'][0]['percent'][0], 0)
        self.assertEqual(unit['missing'][0]['percent'][unit['labels'].index('lag_30')], 100)
        self.assertEqual(unit['missing'][-1]['percent'], [0] * len(unit['labels']))
        self.assertAlmostEqual(unit['correlation'][0][unit['labels'].index('lag_7')], 1)
        changed = data.copy()
        changed.loc[changed.dt > pd.Timestamp('2026-03-21'), 'sale_amount'] = 987654
        self.assertEqual(report, feature_diagnostics(changed, '2026-03-21'))
        json.dumps(report, allow_nan=False)

    def test_constant_series_has_null_correlation_not_fabricated_zero(self):
        data = self.frame()
        data['sale_amount'] = 0
        report = feature_diagnostics(data, '2026-03-21')
        for unit in report['by_unit'].values():
            self.assertTrue(all(value is None for value in unit['correlation'][0]))
        json.dumps(report, allow_nan=False)


if __name__ == '__main__':
    unittest.main()
