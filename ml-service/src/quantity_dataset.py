"""Reproduce a modest, deterministic M5 unit-sales snapshot from the organizer archive."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REVISION = "904bfacd2f6022259b015ac417a4978afdfcaf2e"
BASE = f"https://media.githubusercontent.com/media/Mcompetitions/M5-methods/{REVISION}/Dataset/"
FILES = {
    "sales_train_evaluation.csv": (121168898, "c21a519596680feb86f27a9e62f6c8b583f8be60c2c195f080ae8ca2990af2b7"),
    "calendar.csv": (112477, "568d0fe5f41790142379698732908e4e57432c1c6396f3f59fb880a9c2b54231"),
}


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def prepare(download: bool = False) -> Path:
    raw = ROOT / "data/raw/m5"
    out = ROOT / "data/processed/m5"
    raw.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    for name, (size, expected) in FILES.items():
        path = raw / name
        if not path.exists():
            if not download:
                raise ValueError(f"Missing {path}; run with --download")
            print(f"Downloading official M5 {name}", flush=True)
            partial = path.with_suffix(".partial")
            with urlopen(BASE + name, timeout=60) as response, partial.open("wb") as stream:
                while chunk := response.read(1024 * 1024):
                    stream.write(chunk)
            if partial.stat().st_size != size or digest(partial) != expected:
                raise ValueError(f"Official M5 checksum mismatch: {name}")
            partial.replace(path)
        if path.stat().st_size != size or digest(path) != expected:
            raise ValueError(f"M5 input integrity failure: {name}")
    # IDs only: selection never examines future targets or forecast performance.
    stores = ["CA_1", "TX_1", "WI_1"]
    chosen = []
    for chunk in pd.read_csv(raw / "sales_train_evaluation.csv", chunksize=4000):
        chosen.append(chunk.loc[chunk.store_id.isin(stores) & chunk.item_id.str.startswith("FOODS_")])
    wide = pd.concat(chosen, ignore_index=True)
    products = sorted(wide.item_id.unique())[:20]
    wide = wide.loc[wide.item_id.isin(products)]
    calendar = pd.read_csv(raw / "calendar.csv")
    days = sorted([column for column in wide if column.startswith("d_")], key=lambda value: int(value[2:]))
    dates = {f"d_{i + 1}": date for i, date in enumerate(calendar.date)}
    frame = wide.melt(id_vars=["store_id", "item_id"], value_vars=days, var_name="day", value_name="quantity")
    frame["date"] = frame.day.map(dates)
    frame = frame.rename(columns={"item_id": "product_id"})
    frame["unit_code"] = "UNIT"  # M5 reports item units, not KG/CAN or a Vietnamese product identity.
    frame["source"] = "M5_EXTERNAL"
    frame = frame[["date", "store_id", "product_id", "quantity", "unit_code", "source"]]
    frame = frame.sort_values(["store_id", "product_id", "date"])
    path = out / "quantity_snapshot.csv"
    frame.to_csv(path, index=False, lineterminator="\n")
    provenance = {
        "dataset": "M5 organizer unit-sales archive", "source_kind": "EXTERNAL",
        "source_url": "https://github.com/Mcompetitions/M5-methods", "revision": REVISION,
        "original_competition": "https://www.kaggle.com/competitions/m5-forecasting-accuracy",
        "terms": "Original M5 competition data terms apply; research subset, not a new license.",
        "files": {name: {"url": BASE + name, "bytes": size, "sha256": sha} for name, (size, sha) in FILES.items()},
        "selection": "CA_1,TX_1,WI_1; lexicographically first 20 FOODS item IDs; no target-based selection",
        "stores": stores, "products": products, "pairs": len(wide), "rows": len(frame),
        "start_date": frame.date.min(), "end_date": frame.date.max(),
        "historical_dates_preserved": True, "quantity_semantics": "original observed item-unit sales",
        "snapshot_sha256": digest(path),
    }
    path.with_suffix(".provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"snapshot": str(path), "rows": len(frame), "pairs": len(wide), "dates": [frame.date.min(), frame.date.max()]}))
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true")
    prepare(parser.parse_args().download)
