"""Train on training games, choose settings on validation games, report held-out games."""
from __future__ import annotations

import csv
import hashlib
import html
import importlib.metadata
import json
import os
from pathlib import Path
import sys

# Small tabular models do not benefit from competing for all CPU threads.
os.environ.setdefault("OMP_NUM_THREADS", "2")
cache = Path(__file__).resolve().parent / ".cache"
cache.mkdir(exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(cache))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import spearmanr
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from features import FEATURES

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "artifacts"
SEED = 42


def make_splits(rows: list[dict]) -> dict[str, np.ndarray]:
    """Approximately 60/20/20 by source-game groups, not by individual rows."""
    groups = np.array([row["game_group"] for row in rows])
    if len(set(groups)) < 15:
        raise ValueError("Need at least 15 source-game groups for this experiment")
    train_val, test = next(GroupShuffleSplit(n_splits=1, test_size=.2, random_state=SEED).split(rows, groups=groups))
    train_sub, val_sub = next(GroupShuffleSplit(n_splits=1, test_size=.25, random_state=SEED + 1).split(train_val, groups=groups[train_val]))
    splits = {"train": train_val[train_sub], "validation": train_val[val_sub], "test": test}
    for left, right in [("train", "validation"), ("train", "test"), ("validation", "test")]:
        assert set(groups[splits[left]]).isdisjoint(groups[splits[right]])
        left_positions = {rows[index]["position_key"] for index in splits[left]}
        right_positions = {rows[index]["position_key"] for index in splits[right]}
        if not left_positions.isdisjoint(right_positions):
            raise ValueError("Duplicate or mirrored position crosses split boundaries")
    return splits


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    correlation = float(spearmanr(actual, predicted).statistic) if np.ptp(predicted) > 0 and np.ptp(actual) > 0 else None
    return {"mae": float(mean_absolute_error(actual, predicted)), "spearman": correlation}


def paired_bootstrap(actual: np.ndarray, predicted: np.ndarray, baseline: np.ndarray, groups: np.ndarray) -> list[float]:
    """Resample source games to estimate uncertainty in the paired MAE difference."""
    rng = np.random.default_rng(SEED)
    unique = np.unique(groups)
    indices = {group: np.flatnonzero(groups == group) for group in unique}
    differences = np.abs(actual - predicted) - np.abs(actual - baseline)
    samples = []
    for _ in range(1000):
        sampled_rows = np.concatenate([indices[group] for group in rng.choice(unique, size=len(unique), replace=True)])
        samples.append(float(np.mean(differences[sampled_rows])))
    return np.quantile(samples, [.025, .975]).tolist()


def run() -> dict:
    with (OUT / "features.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    prep = json.loads((OUT / "preparation.json").read_text(encoding="utf-8"))
    verification = json.loads((OUT / "independent_verification.json").read_text(encoding="utf-8"))
    sample_manifest = json.loads((ROOT / "data" / "lichess_mate_in_one.manifest.json").read_text(encoding="utf-8"))
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    if digest(ROOT / "data" / "lichess_mate_in_one.csv") != prep["source_sha256"] or sample_manifest["sample_sha256"] != prep["source_sha256"] or digest(OUT / "features.csv") != prep["features_sha256"] or verification.get("positions_sha256") != digest(OUT / "positions.jsonl") or not verification["passed"] or verification["compared"] != len(rows):
        raise ValueError("Inputs changed or independent verification is incomplete. Re-run prepare and verify.")
    X = np.array([[float(row[feature]) for feature in FEATURES] for row in rows])
    y = np.array([float(row["rating"]) for row in rows])
    splits = make_splits(rows)
    train, validation, test = (splits[name] for name in ["train", "validation", "test"])
    models = {}
    # Only board-derived columns enter X. Ratings, play counts, IDs, and tags are excluded.
    candidates = {
        "Training median": [(DummyRegressor(strategy="median"), [0], {})],
        "Piece count": [(make_pipeline(StandardScaler(), Ridge(alpha=alpha)), [FEATURES.index("piece_count")], {"alpha": alpha}) for alpha in [1, 10, 100]],
        "Checking-ratio score": [(make_pipeline(StandardScaler(), Ridge(alpha=alpha)), [FEATURES.index("checking_ratio_score")], {"alpha": alpha}) for alpha in [1, 10, 100]],
        "Linear board features": [(make_pipeline(StandardScaler(), Ridge(alpha=alpha)), list(range(len(FEATURES))), {"alpha": alpha}) for alpha in [.1, 1, 10, 100]],
        "Boosted trees": [(HistGradientBoostingRegressor(loss="absolute_error", learning_rate=.05, max_iter=150, max_leaf_nodes=leaves, l2_regularization=10, random_state=SEED, early_stopping=False), list(range(len(FEATURES))), {"max_leaf_nodes": leaves, "max_iter": 150, "learning_rate": .05, "l2_regularization": 10}) for leaves in [7, 15]],
    }
    for name, settings in candidates.items():
        fitted = []
        for estimator, columns, parameters in settings:
            estimator.fit(X[train][:, columns], y[train])
            validation_result = metrics(y[validation], estimator.predict(X[validation][:, columns]))
            fitted.append((validation_result["mae"], estimator, columns, parameters, validation_result))
        _, estimator, columns, parameters, validation_result = min(fitted, key=lambda item: item[0])
        models[name] = {"estimator": estimator, "columns": columns, "parameters": parameters, "validation": validation_result}
    # Freeze the selected model before looking at any test-set scores.
    selected = min(models, key=lambda name: models[name]["validation"]["mae"])
    for model in models.values():
        model["predictions"] = model["estimator"].predict(X[test][:, model["columns"]])
        model["test"] = metrics(y[test], model["predictions"])
    chosen = models[selected]
    baseline = models["Training median"]
    groups = np.array([rows[index]["game_group"] for index in test])
    interval = paired_bootstrap(y[test], chosen["predictions"], baseline["predictions"], groups)
    raw_score = X[test, FEATURES.index("checking_ratio_score")]
    raw_correlation = float(spearmanr(y[test], raw_score).statistic) if np.ptp(raw_score) else None
    report = {
        "experiment": "Mate-in-one difficulty pilot v1", "target": "Lichess puzzle rating, not universal cognitive difficulty",
        "seed": SEED, "n_positions": len(rows), "n_features": len(FEATURES),
        "split_counts": {name: len(indices) for name, indices in splits.items()},
        "split_game_counts": {name: len({rows[index]["game_group"] for index in indices}) for name, indices in splits.items()},
        "split_policy": "Source-game grouped 60/20/20 split after exact/mirrored deduplication; train fits parameters and scaling, validation selects settings/model, test reports results once.",
        "selected_on_validation": selected,
        "models": {name: {key: value for key, value in model.items() if key in ["parameters", "validation", "test"]} for name, model in models.items()},
        "raw_checking_ratio_test_spearman": raw_correlation,
        "selected_vs_median_mae_difference_95pct_group_bootstrap": interval,
        "bootstrap_note": "1000 source-game bootstrap resamples; negative MAE differences favor the selected model. This excludes training and model-selection uncertainty.",
        "sample_sha256": prep["source_sha256"], "features_sha256": prep["features_sha256"],
        "sample_manifest": sample_manifest, "independent_verification": verification,
        "versions": {package: importlib.metadata.version(package) for package in ["chess", "numpy", "scikit-learn", "scipy", "matplotlib"]},
        "python": sys.version.split()[0],
        "limitations": [
            "A seeded sample of a quality-filtered bounded prefix, not a representative sample of every puzzle or learner.",
            "Ratings are noisy, platform-specific aggregate outcomes. The CSV does not provide individual solve times or player attempts.",
            "Exact/mirrored duplicates are removed and source games are grouped; other near-duplicate tactical patterns may remain.",
            "The holdout becomes a development set if repeatedly inspected and used to redesign the model; use new held-out data for future confirmatory claims.",
            "Model associations are not causal explanations of human difficulty. Generalization to composed teaching puzzles is untested.",
            "No human learning improvement or player rating prediction is established by this study.",
        ],
    }
    (OUT / "results.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    with (OUT / "splits.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n"); writer.writerow(["puzzle_id", "game_group", "split"])
        for name, indices in splits.items():
            writer.writerows((rows[index]["puzzle_id"], rows[index]["game_group"], name) for index in indices)
    with (OUT / "test_predictions.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n"); writer.writerow(["puzzle_id", "rating", "prediction", "absolute_error", "fen", "source_game"])
        for index, predicted in zip(test, chosen["predictions"]):
            writer.writerow([rows[index]["puzzle_id"], y[index], float(predicted), abs(y[index] - predicted), rows[index]["fen"], rows[index]["game_group"]])
    linear = models["Linear board features"]["estimator"].named_steps["ridge"]
    with (OUT / "linear_coefficients.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n"); writer.writerow(["feature", "coefficient_per_training_standard_deviation"])
        writer.writerows(sorted(zip(FEATURES, linear.coef_), key=lambda item: -abs(item[1])))
    make_outputs(report, models, y, test)
    print(json.dumps({"selected_on_validation": selected, "test": chosen["test"], "median_test": baseline["test"], "positions": len(rows)}, indent=2), flush=True)
    return report


def make_outputs(report: dict, models: dict, y: np.ndarray, test: np.ndarray) -> None:
    selected = report["selected_on_validation"]
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.5), layout="constrained")
    fig.suptitle("Mate-in-one difficulty pilot · held-out source games", fontsize=15)
    axes[0].hist(y, bins=28, color="#77916a", edgecolor="white")
    axes[0].set(xlabel="Lichess puzzle rating", ylabel="Positions", title=f"Dataset: {len(y):,} positions")
    predicted = models[selected]["predictions"]
    axes[1].scatter(y[test], predicted, s=13, alpha=.4, color="#214d40", edgecolors="none")
    low, high = min(y[test].min(), predicted.min()), max(y[test].max(), predicted.max())
    axes[1].plot([low, high], [low, high], "--", color="#c77851", linewidth=1)
    axes[1].set(xlabel="Observed rating", ylabel="Predicted rating", title=f"Selected on validation: {selected}")
    names = list(models)
    axes[2].barh(names, [models[name]["test"]["mae"] for name in names], color=["#214d40" if name == selected else "#a4b391" for name in names])
    axes[2].set(xlabel="Test mean absolute error (rating points)", title="Lower prediction error is better")
    axes[2].invert_yaxis()
    fig.savefig(OUT / "metrics.png", dpi=160)
    plt.close(fig)
    rho = lambda value: "undefined (constant predictions)" if value is None else f"{value:.3f}"
    table = "\n".join(f"| {name} | {model['validation']['mae']:.1f} | {model['test']['mae']:.1f} | {rho(model['test']['spearman'])} |" for name, model in models.items())
    selected_mae = models[selected]["test"]["mae"]
    median_mae = models["Training median"]["test"]["mae"]
    change = (median_mae - selected_mae) / median_mae * 100
    summary = f"The validation-selected model was {selected}. Its held-out MAE was {selected_mae:.1f} rating points, compared with {median_mae:.1f} for the training-median baseline ({change:.1f}% lower error)."
    markdown = f"""# Mate-in-one difficulty pilot v1

Question: can board-derived features predict Lichess ratings among mate-in-one puzzles?

{summary}

This is a measured result for this sample and split, not evidence that a model understands human reasoning or improves learning.

## Data and evaluation

{report['n_positions']:,} validated unique positions, {report['n_features']} board-derived features. Splits: {report['split_counts']}. {report['split_policy']}

Raw mathematical score: D = log(checking moves / mating moves). Its test Spearman correlation was {rho(report['raw_checking_ratio_test_spearman'])}. The rating-scale score below fits a linear mapping on training data; the raw score is not itself an Elo rating.

| Model | Validation MAE | Test MAE | Test Spearman |
| --- | ---: | ---: | ---: |
{table}

Selected-model minus median-baseline MAE difference, 95% game-bootstrap interval: {report['selected_vs_median_mae_difference_95pct_group_bootstrap']}. {report['bootstrap_note']}

![Evaluation chart](metrics.png)

## Independent chess checks

python-chess and chess.js agreed on legal, checking, and mating move sets and the reply counts after every check for {report['independent_verification']['compared']:,} positions. This verifies the checked board calculations, not the rating model or arbitrary lesson prose.

## Limits

""" + "\n".join(f"- {item}" for item in report["limitations"]) + "\n\nSource: [Lichess CC0 puzzle database](https://database.lichess.org/#puzzles). See results.json for sample provenance, hashes, versions, settings, and counts. Predictions and split assignments are saved separately.\n"
    (OUT / "REPORT.md").write_text(markdown, encoding="utf-8")
    html_rows = "".join(f"<tr><th>{html.escape(name)}</th><td>{model['validation']['mae']:.1f}</td><td>{model['test']['mae']:.1f}</td><td>{rho(model['test']['spearman'])}</td></tr>" for name, model in models.items())
    page = f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mate Lab · Difficulty study</title>
<style>body{{font:16px/1.7 system-ui,sans-serif;color:#233e35;background:#f6f4ed;margin:0}}main{{max-width:1080px;margin:48px auto;padding:0 24px}}a{{color:#285d44}}h1,h2{{font-family:Georgia,serif;font-weight:400;line-height:1.2}}h1{{font-size:42px}}.eyebrow{{letter-spacing:2px;font-size:12px;color:#6c8061}}.finding{{background:#e5ecdb;padding:24px;border-radius:10px}}img{{width:100%;height:auto;margin:24px 0}}table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{padding:12px;border-bottom:1px solid #ccd4c3;text-align:left}}.scroll{{overflow:auto}}.limits{{font-size:14px;color:#596c5b}}footer{{margin-top:40px;border-top:1px solid #ccd4c3;padding-top:20px;font-size:13px}}@media(max-width:600px){{h1{{font-size:32px}}main{{margin-top:24px}}}}</style>
<main><a href="/">← Mate Lab trainer</a><p class="eyebrow">REPRODUCIBLE DIFFICULTY PILOT · V1</p><h1>What makes a one-move mate harder?</h1><p>Predicting Lichess puzzle ratings from board-derived features, with source-game-separated evaluation.</p><div class="finding"><strong>Observed result</strong><p>{html.escape(summary)}</p><small>This estimates a platform rating. It does not establish universal human difficulty.</small></div><img src="metrics.png" alt="Rating distribution, held-out predictions, and errors compared with baselines"><h2>The comparisons</h2><div class="scroll"><table><thead><tr><th>Model</th><th>Validation MAE</th><th>Test MAE</th><th>Test Spearman</th></tr></thead><tbody>{html_rows}</tbody></table></div><p>{report['n_positions']:,} positions · {report['n_features']} features · split counts {html.escape(str(report['split_counts']))}. Lower MAE is better; higher Spearman indicates better rank ordering.</p><p>The raw checking-ratio score, log(checking moves / mating moves), had test Spearman {rho(report['raw_checking_ratio_test_spearman'])}. The calibrated score fits its rating scale using training data only.</p><h2>What we checked</h2><p>Two independent chess implementations agreed on the legal, checking, and mating moves and check-reply counts for all {report['n_positions']:,} retained positions. Model settings were selected on validation data before reporting the test scores.</p><h2>Limits worth discussing</h2><ul class="limits">{"".join(f'<li>{html.escape(item)}</li>' for item in report['limitations'])}</ul><footer>Source: <a href="https://database.lichess.org/#puzzles">Lichess CC0 puzzle database</a>. Reproduce this pilot with the repository's research instructions. <a href="results.json">Full results and provenance</a> · <a href="REPORT.md">Written report</a></footer></main></html>"""
    (OUT / "report.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    run()
