"""Measured, bounded chart data for AI Center. Never changes training inputs."""
import numpy as np
import pandas as pd

from .features import MODEL_FEATURES, build_features


def feature_diagnostics(data, train_end):
    # The descriptive correlations use the initial training partition only.
    # Future holdout values cannot influence this report or feature selection.
    training = data.loc[data.dt <= pd.Timestamp(train_end)].copy()
    features = build_features(training)
    columns = ['sale_amount', *MODEL_FEATURES]
    labels = ['quantity', *MODEL_FEATURES]
    result = {'train_end': str(pd.Timestamp(train_end).date()), 'by_unit': {}}
    for unit, group in features.groupby('unit_code', sort=True):
        eligible = group.loc[group.training_eligible, columns]
        corr = eligible.corr(method='pearson', min_periods=2).to_numpy()
        # Up to 24 time buckets; missing lag warmup is shown, never filled with 0.
        days = sorted(group.dt.unique())
        buckets = np.array_split(days, min(24, len(days)))
        missing = []
        for bucket in buckets:
            part = group.loc[group.dt.isin(bucket), columns]
            missing.append({'from': str(pd.Timestamp(bucket[0]).date()),
                            'to': str(pd.Timestamp(bucket[-1]).date()), 'rows': len(part),
                            'percent': [float(v) for v in part.isna().mean().mul(100)]})
        result['by_unit'][str(unit)] = {
            'labels': labels, 'rows': len(group), 'eligible_rows': len(eligible),
            'correlation': [[float(v) if np.isfinite(v) else None for v in row] for row in corr],
            'missing': missing,
        }
    return result
