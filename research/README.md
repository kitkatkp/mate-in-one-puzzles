# Mate-in-one difficulty pilot

Research question: can simple board-derived features predict Lichess puzzle ratings among mate-in-one positions?

Start with [START_HERE.md](START_HERE.md) for the one-week learning plan and [artifacts/REPORT.md](artifacts/REPORT.md) for measured results. The report is also included in the browser build at `/research/`.

## Setup on Windows

Use Python 3.12 and Node.js 24 from the repository root. The Python commands below use the virtual environment executable directly; PowerShell activation is optional.

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r research/requirements-lock.txt
npm ci
```

The existing workspace already has the environment installed. On macOS/Linux substitute `.venv/bin/python` for `.venv/Scripts/python.exe`. Direct research dependencies are listed in requirements.txt; requirements-lock.txt also pins their transitive dependencies. This pins versions, not wheel hashes or a full operating-system environment.

## Reproduce the committed pilot without a fresh download

```powershell
.venv/Scripts/python.exe -m unittest discover -s research -p 'test_*.py'
.venv/Scripts/python.exe research/prepare.py
npm run research:verify
.venv/Scripts/python.exe research/experiment.py
npm run check
```

Then run `npm run dev` and open the trainer's difficulty-study link, or `http://127.0.0.1:4173/research/`.

Expected pilot: 3,000 positions; 24 features; 1,800/600/600 rows in training/validation/test; no differences in the two-library chess comparison. Boosted trees were selected on validation MAE, and the test MAE was about 190.7 versus 241.3 for a constant training-median prediction. Exact values, versions, parameters, and hashes are in results.json. Runtime may vary across machines.

Re-running the unchanged experiment to verify reproduction is different from repeatedly redesigning it based on observed test scores. The v1 test set is now exposed. Use new held-out data when making new confirmatory model claims.

## Obtain a new exploratory sample

```powershell
.venv/Scripts/python.exe research/fetch_sample.py --size 3000 --max-source-rows 100000 --seed 42 --output research/data/new_exploratory.csv
```

This streams a bounded prefix from the public Lichess Zstandard CSV, filters `mateIn1`, requires at least 100 plays and rating deviation at most 100, and reservoir-samples eligible rows using a fixed seed. It stops reading after the scan limit. The selected CSV has a SHA-256 hash and an adjacent source manifest.

Changing the seed or fetching the same prefix again does not create an independent new test set: it can overlap the v1 rows, games, or tactical patterns. A later confirmatory study must explicitly exclude the v1 games and duplicate-equivalent positions, and record its sampling policy before fitting models.

The experiment uses the committed `lichess_mate_in_one.csv` snapshot. To work with another dataset, call `prepare.prepare(source=...)` into a separate experiment folder and adapt the experiment paths deliberately; do not silently overwrite the v1 snapshot or report.

## Pipeline and files

| File | Responsibility |
| --- | --- |
| fetch_sample.py | Bounded download, quality filter, seeded reservoir sample, provenance |
| features.py | Apply the opponent's setup move; validate; enumerate checks/mates; compute 24 board-only features |
| prepare.py | Keep the most-played representative of duplicate/mirrored positions; save features and chess evidence |
| verify_with_chessjs.ts | Independently compare legal/checking/mating move sets and check-reply counts |
| experiment.py | Grouped splits; training; validation selection; held-out evaluation; plots and reports |
| test_research.py | Tests for setup interpretation, chess features, split boundaries, metrics, and sampling |
| data/ | Committed CC0 raw sample and source manifest |
| artifacts/ | Feature table, split assignments, predictions, coefficients, metrics, and report |

The generated positions.jsonl is ignored because it is reproducible from the committed CSV and is only an intermediate cross-check input. The report records its hash. No pickled model is needed or loaded by the web app: its study page is a static report, not live inference for arbitrary new positions.

## Feature definitions and mathematical baseline

The score `log(checking_moves / mating_moves)` is the negative log success probability under a hypothetical solver that chooses uniformly among legal checks. It does not claim that people actually follow that policy.

Other features include piece counts, check and mate counts, nonmating checks with only one reply, mean reply count after nonmating checks, defending king distance from the edge, adjacent friendly blockers, and available mating move mechanisms/pieces. The adjacent attacked-square feature describes the starting board's attacks, not hypothetical legal king escapes after a move. All correct mates are enumerated, even if the dataset publishes only one.

Ratings, play counts, rating deviation, themes, IDs, and game identifiers are never model input features. Play count/deviation are used to select the initial sample; game IDs only define split groups. Standardization is fit on training data. The experiment compares:

- A training-median baseline.
- A piece-count-only ridge regression.
- A ridge regression mapping the checking-ratio score onto rating units.
- Ridge regression using all board features.
- A small histogram gradient-boosted tree comparison.

Settings and the overall model are selected by validation MAE. The selected models are not refit on the validation set for v1. Held-out scores are reported for transparency, not used to select the winner. Standardized linear coefficients describe associations conditional on the other, sometimes correlated, features; they are not causal importance scores.

## Provenance and limits

Source: [Lichess open puzzle database](https://database.lichess.org/#puzzles), released as CC0. Its documented solver position is obtained by applying the first UCI move to the stored FEN. Puzzle ratings come from player/puzzle Glicko-2 outcomes. They are platform-specific aggregate labels, not individual solve-time or cognitive-difficulty measurements.

The pilot has a bounded, filtered sample; it is not representative of the whole database. Exact/mirrored duplicates are removed and source games are grouped, but near-duplicate motifs can remain. Performance on the trainer's composed lessons is untested. Bootstrap intervals only quantify resampling of the fixed test games, not uncertainty from training/model selection. No human-learning improvement, global novelty, or production-readiness is claimed.

The research CI workflow reproduces from the committed snapshot without downloading the upstream database. It has been added locally; a successful local run does not establish that the hosted workflow has run.
