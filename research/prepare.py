"""Validate raw rows, deduplicate positions, and extract a reproducible feature table."""
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from features import FEATURES, extract, position_key, solver_board

ROOT = Path(__file__).resolve().parent


def prepare(source: Path = ROOT / "data" / "lichess_mate_in_one.csv", output: Path = ROOT / "artifacts") -> dict:
    output.mkdir(parents=True, exist_ok=True)
    with source.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    unique = {}
    rejected = []
    for row in sorted(rows, key=lambda item: (-int(item["NbPlays"]), item["PuzzleId"])):
        try:
            board = solver_board(row["FEN"], row["Moves"])
            key = position_key(board)
            if key not in unique:
                unique[key] = (row, board)
        except ValueError as error:
            rejected.append({"puzzle_id": row["PuzzleId"], "reason": str(error)})
    fields = ["puzzle_id", "rating", "rating_deviation", "plays", "game_group", "position_key", "fen", *FEATURES]
    with (output / "features.csv").open("w", encoding="utf-8", newline="") as features_file, (output / "positions.jsonl").open("w", encoding="utf-8") as evidence_file:
        writer = csv.DictWriter(features_file, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        for index, (key, (row, board)) in enumerate(sorted(unique.items()), start=1):
            values, evidence = extract(board)
            game_group = urlparse(row["GameUrl"]).path.strip("/").split("/")[0]
            if not game_group:
                raise ValueError("Missing source game identifier")
            writer.writerow({"puzzle_id": row["PuzzleId"], "rating": row["Rating"], "rating_deviation": row["RatingDeviation"], "plays": row["NbPlays"], "game_group": game_group, "position_key": key, "fen": board.fen(), **values})
            evidence_file.write(json.dumps({"puzzle_id": row["PuzzleId"], **evidence}, sort_keys=True) + "\n")
            if index % 500 == 0:
                print(f"Extracted {index}/{len(unique)} validated positions", flush=True)
    manifest = {"input_rows": len(rows), "valid_unique_positions": len(unique), "invalid_rows": rejected, "duplicates_removed": len(rows) - len(rejected) - len(unique), "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "features_sha256": hashlib.sha256((output / "features.csv").read_bytes()).hexdigest(), "feature_columns": FEATURES, "deduplication": "Exact board/turn/rights/relevant-en-passant duplicates and rank-mirrored color-swapped equivalents; representative with most plays kept."}
    (output / "preparation.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in manifest.items() if key not in ["feature_columns", "deduplication"]}), flush=True)
    return manifest


if __name__ == "__main__":
    prepare()
