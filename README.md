# Mate Lab — Mate-in-One Puzzles

A TypeScript chess teaching prototype: ten original positions in five related pairs, a playable board, and explanations grounded in legal-move analysis. The original three sample records and standalone database validator remain available.

## Run the trainer

Use Node.js 24 (also used in CI).

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:4173**. The local server listens only on your computer. Select a piece and destination, or enter a move in chess notation. It accepts every legal mating move, not just the lesson's preferred example. Black exercises automatically use Black's perspective; the board can be flipped.

The dev command builds once and starts a static preview. After editing files, run `npm run build` in another terminal and refresh the browser. Stop the server with Ctrl+C. A built `dist/` can also be served by any static web host; this task does not configure hosting.

## The learning experience

- Five paired lessons: king support, back-rank escapes, protecting the checker, a trapped king, and discovered checks. Each pair differs by exactly one relocated piece.
- Every puzzle has a learning objective, a written explanation, a hint, a verified non-mating alternative, a provisional difficulty profile, and an understanding question.
- Wrong legal moves receive a concrete legal defence. Illegal moves explain movement rules, blockers, or king safety. Stalemate is distinguished from checkmate.
- Mate explanations identify the checker, examine every neighboring king square, and explain why no legal capture or block answers the check. Select an escape-square explanation to highlight its attackers on the board.
- The notebook separates first-try accuracy, eventual solves, successful first-try time, hints, solution views, and understanding answers. Give each learner a distinct nickname on a shared device. Export raw JSON events for analysis.

Results stay in browser local storage; there are no accounts, analytics services, API keys, or remote calls from the trainer. Corrupt saved results are left untouched while new results remain in memory. Export before clearing data. Difficulty bands are teaching judgments, not measured player ratings.

See [docs/LEARNER_TRIAL.md](docs/LEARNER_TRIAL.md) for a small human trial and [docs/VERIFICATION.md](docs/VERIFICATION.md) for the implementation's checks and limits.

## Difficulty research pilot

A separate Python experiment predicts Lichess puzzle ratings using 24 board-derived features from a committed sample of 3,000 mate-in-one puzzles. It compares a constant baseline, a checking-move score, linear regression, and boosted trees with a source-game-grouped train/validation/test split. A second chess library independently checks the move calculations against `chess.js`.

Read [research/START_HERE.md](research/START_HERE.md) for a guided one-week learning plan, [research/README.md](research/README.md) to reproduce the experiment, and [the measured report](research/artifacts/REPORT.md) for results and limitations. The browser build includes the report at `/research/`; the trainer's difficulty bands remain provisional and are not replaced by this model.

## Development commands

```bash
npm run check
```

This runs TypeScript checking, regression tests, validation of the original records and teaching curriculum, and a production browser build.

- `npm run validate`: validate the three sample records.
- `npm run validate -- path/to/puzzles.json`: validate another JSON file.
- `npm run validate:curriculum`: check all ten teaching puzzles, complete solutions, pair links, one-piece changes, and counterexamples.
- `npm test`: validator, move-analysis, and study-statistics regression tests.
- `npm run typecheck`: check TypeScript without emitting files.
- `npm run build`: bundle the browser app into `dist/`.
- `npm run preview`: serve an existing build on port 4173.

An explicit validator file path is relative to your working directory; the default sample path is resolved relative to the script.

## Repository map

| Location | Purpose |
| --- | --- |
| `data/puzzles.json` | Three original standalone examples |
| `data/lessons.ts` | Ten typed teaching records; all authored content and links |
| `src/validation.ts` | Runtime record validation and complete mate enumeration |
| `src/analysis.ts` | Move feedback, legal counterexamples, mate facts, move-mechanic tags |
| `src/curriculum.ts` | Checks teaching records and one-piece pair relationships |
| `src/progress.ts` | Study event validation and statistics |
| `web/` | Responsive, keyboard-accessible browser interface |
| `scripts/` | CLI validation, build, and local preview server |
| `tests/` | Regression and exhaustive curriculum-move checks |
| `.github/workflows/validate.yml` | Full checks on pushes and pull requests to main |

Dependencies are installed by npm and are not tracked in Git. The browser app uses plain TypeScript and CSS, `chess.js` for rules, and `esbuild` for bundling.

## Standalone puzzle format

```json
{
  "id": "sample-01",
  "fen": "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
  "sideToMove": "w",
  "solutions": ["Qg7#"]
}
```

IDs must be non-empty and unique; whitespace is ignored for duplicate detection. `sideToMove` must match the six-field FEN. List every mating move in canonical SAN, including capture markers, disambiguation, promotion notation, and `#`. Multiple solutions are allowed, but each must appear exactly once. Teaching records extend this format with the fields defined in `src/types.ts`.

## Validation and analysis limits

The database validator rejects malformed records, duplicate IDs and normalized positions, invalid FENs, mismatched turns, missing or incorrect solutions, and locally inconsistent material, castling, or en passant state. Positions with the side not to move already in check are rejected. Move counters do not make positions distinct.

These checks do not prove historical reachability from the starting position. The analysis API expects a valid position, as supplied by the validated curriculum. It uses exhaustive legal replies for mate detection, not an engine evaluation of which move is best. A counterexample proves that a move fails to mate immediately; it does not prove that the move loses the game.

Pattern names and recognition demands are authored. Move-piece and capture, promotion, castling, en passant, and discovered/double-check tags are derived from the actual played solution. There is no calibrated Elo, adaptive scheduling algorithm, cloud persistence, or claim of demonstrated learning improvement yet.
