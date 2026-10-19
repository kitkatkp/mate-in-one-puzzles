"""Download a bounded, seeded sample, not the entire multi-million-row database."""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import random
from urllib.request import Request, urlopen

import zstandard

ROOT = Path(__file__).resolve().parent
URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
FIELDS = ["PuzzleId", "FEN", "Moves", "Rating", "RatingDeviation", "NbPlays", "Themes", "GameUrl"]


def reservoir_add(sample: list, item: dict, eligible_count: int, size: int, rng: random.Random) -> None:
    """Each eligible row in the scanned prefix has the same chance of selection."""
    if len(sample) < size:
        sample.append(item)
    else:
        index = rng.randrange(eligible_count)
        if index < size:
            sample[index] = item


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--size", type=int, default=3000)
    parser.add_argument("--max-source-rows", type=int, default=100000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--min-plays", type=int, default=100)
    parser.add_argument("--max-deviation", type=int, default=100)
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "lichess_mate_in_one.csv")
    args = parser.parse_args()
    if args.size < 1 or args.max_source_rows < args.size:
        parser.error("size must be positive and no greater than max-source-rows")
    selected: list[dict] = []
    rng = random.Random(args.seed)
    scanned = eligible = 0
    request = Request(URL, headers={"User-Agent": "MateLabDifficultyStudy/1.0"})
    with urlopen(request, timeout=60) as response:
        headers = {key: response.headers.get(key) for key in ["Last-Modified", "ETag", "Content-Length"]}
        with zstandard.ZstdDecompressor().stream_reader(response) as stream:
            rows = csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8", newline=""))
            if not set(FIELDS).issubset(rows.fieldnames or []):
                raise ValueError("Unexpected upstream CSV schema")
            for row in rows:
                scanned += 1
                if "mateIn1" in row["Themes"].split() and int(row["NbPlays"]) >= args.min_plays and int(row["RatingDeviation"]) <= args.max_deviation:
                    eligible += 1
                    reservoir_add(selected, {field: row[field] for field in FIELDS}, eligible, args.size, rng)
                if scanned >= args.max_source_rows:
                    break
    if len(selected) < args.size:
        raise ValueError(f"Only {len(selected)} eligible rows; increase the scan limit or reduce size")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(sorted(selected, key=lambda row: row["PuzzleId"]))
    manifest = {
        "source": URL, "license": "CC0", "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "upstream_headers": headers, "source_rows_scanned": scanned, "eligible_rows": eligible,
        "selected_rows": len(selected), "seed": args.seed, "min_plays": args.min_plays,
        "max_rating_deviation": args.max_deviation,
        "sample_sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
        "sampling_limit": "Seeded reservoir sample within a bounded prefix; not a uniform sample of the complete Lichess database.",
        "position_rule": "FEN precedes the opponent move. Apply Moves[0] to obtain the solver position; Moves[1] is the published solver move.",
    }
    args.output.with_suffix(".manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(selected)} puzzles from {eligible} eligible rows in {scanned} scanned rows.", flush=True)


if __name__ == "__main__":
    main()
