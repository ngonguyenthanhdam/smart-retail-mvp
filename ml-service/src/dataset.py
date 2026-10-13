"""Pinned public dataset acquisition. Never connects to the operational database."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data/raw/freshretailnet-50k"
MANIFEST = ROOT / "dataset_manifest.json"


def verify_file(path: Path, entry: dict) -> None:
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if path.stat().st_size != entry["bytes"] or digest != entry["sha256"]:
        raise ValueError(f"Dataset checksum/size mismatch: {path.name}")


def dataset_files(raw_dir: Path = RAW_DIR) -> tuple[dict, list[Path]]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    paths = []
    for entry in manifest["files"]:
        path = raw_dir / entry["name"]
        verify_file(path, entry)
        paths.append(path)
    return manifest, paths


def download(raw_dir: Path = RAW_DIR) -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    raw_dir.mkdir(parents=True, exist_ok=True)
    for entry in manifest["files"]:
        path = raw_dir / entry["name"]
        if not path.exists():
            url = (f"https://huggingface.co/datasets/{manifest['dataset']}/resolve/"
                   f"{manifest['revision']}/data/{entry['name']}")
            partial = path.with_suffix(".part")
            with urlopen(url, timeout=60) as response, partial.open("wb") as out:
                while block := response.read(1024 * 1024):
                    out.write(block)
            verify_file(partial, entry)
            partial.rename(path)
        verify_file(path, entry)
        print(f"Verified {entry['name']}: {entry['bytes']:,} bytes", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    download(parser.parse_args().raw_dir)
