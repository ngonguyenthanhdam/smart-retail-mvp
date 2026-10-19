"""Bounded local AI Center worker. No database connection or automatic activation."""
import argparse
import json
import os
from pathlib import Path
import threading
import time
from datetime import datetime, timezone

import numpy as np
from .train_quantity import load_snapshot, run, PARAMETERS
from .quantity_model import sha256, activate, ModelRegistry, version_path, load_version, ROOT


def save(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, allow_nan=False, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    temporary.replace(path)


def execute(config_path: Path):
    config = json.loads(config_path.read_text(encoding='utf-8'))
    directory = config_path.parent
    heartbeat = directory / 'heartbeat'
    done = threading.Event()

    def watch():
        while not done.wait(5):
            if not heartbeat.exists() or time.time() - heartbeat.stat().st_mtime > 30:
                os._exit(78)
    threading.Thread(target=watch, daemon=True).start()
    events = []

    def progress(stage, detail):
        events.append({'stage': stage, 'at': datetime.now(timezone.utc).isoformat(), **detail})
        save(directory / 'progress.json', {'stage': stage, 'events': events})
    try:
        snapshot = Path(config['snapshot'])
        if snapshot.stat().st_size > 100 * 1024 * 1024 or sha256(snapshot) != config['sha256']:
            raise ValueError('Dataset checksum/size check failed')
        data = load_snapshot(snapshot, config['synthetic'])
        if len(data) > 400000 or data.groupby(['store_id', 'product_id']).ngroups > 1000:
            raise ValueError('Training supports at most 400000 observations and 1000 series')
        eda = {'rows': len(data), 'pairs': data.groupby(['store_id','product_id']).ngroups,
               'start': str(data.dt.min().date()), 'end': str(data.dt.max().date()),
               'missing_values': int(data[['date','store_id','product_id','quantity','unit_code','source']].isna().sum().sum()),
               'duplicates': int(data.duplicated(['store_id','product_id','dt']).sum()),
               'zero_days': int(data.sale_amount.eq(0).sum()), 'by_unit': {}}
        for unit, group in data.groupby('unit_code'):
            q1, q3 = group.sale_amount.quantile([.25, .75]); threshold = q3 + 1.5 * (q3 - q1)
            daily = group.groupby('dt').sale_amount.sum()
            counts, edges = np.histogram(group.sale_amount, bins=15)
            eda['by_unit'][str(unit)] = {'rows': len(group), 'zero_days': int(group.sale_amount.eq(0).sum()),
                'outliers_retained': int(group.sale_amount.gt(threshold).sum()), 'outlier_rule': 'quantity > Q3 + 1.5 IQR; diagnostic only, retained',
                'distribution': {'counts': counts.tolist(), 'edges': edges.tolist()},
                'daily': [{'date': str(day.date()), 'quantity': float(value)} for day, value in daily.iloc[-730:].items()], 'daily_limit': 730}
        save(directory / 'eda.json', eda)
        supplied = config.get('parameters', {})
        bounds = {'n_estimators': (20, 400), 'learning_rate': (.01, .2), 'num_leaves': (4, 63), 'min_child_samples': (10, 200)}
        if set(supplied) - set(bounds):
            raise ValueError('Unsupported training parameter')
        for key, value in supplied.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not bounds[key][0] <= value <= bounds[key][1]:
                raise ValueError('Invalid training parameter')
            if key != 'learning_rate' and int(value) != value:
                raise ValueError('Training count parameters must be integers')
        parameters = {**PARAMETERS, **supplied, 'n_jobs': 2}
        algorithms = config['algorithms']
        if not {'SeasonalNaive', 'RollingMean28'}.issubset(algorithms):
            raise ValueError('Both reference baselines are required')
        model_root = Path(config['model_root'])
        metadata = run(snapshot, config['version'], config['source_kind'], config['evaluation_days'],
                       config['synthetic'], False, model_root, parameters, algorithms, progress, strict_series=True)
        report = json.loads((version_path(config['version'], model_root) / 'evaluation.json').read_text(encoding='utf-8'))
        save(directory / 'result.json', {'metadata': metadata, 'evaluation': report, 'eda': eda})
    except Exception as error:
        save(directory / 'error.json', {'message': str(error)[:1000]})
        raise
    finally:
        done.set()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path)
    parser.add_argument('--activate')
    parser.add_argument('--expected')
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--model-root', type=Path, default=ROOT / 'models')
    args = parser.parse_args()
    if args.inspect:
        _, metadata = ModelRegistry(args.model_root).get()
        print(json.dumps(metadata))
    elif args.activate:
        current, _ = ModelRegistry(args.model_root).get()
        if current.version != args.expected:
            raise ValueError('Active model changed; review before activation')
        load_version(args.activate, args.model_root)
        print(json.dumps(activate(args.activate, args.model_root)))
    elif args.config:
        execute(args.config.resolve())
    else:
        parser.error('Choose --config, --inspect or explicit --activate with --expected')
