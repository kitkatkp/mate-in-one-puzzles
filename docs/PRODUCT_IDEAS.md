# Product directions to explore

This document records the initial product proposals. The local prototype now implements paired lessons, board-verified mate explanations, feedback on actual mistakes, provisional difficulty profiles, and a learning notebook. Numerical difficulty calibration and adaptive scheduling remain future work. See [LEARNER_TRIAL.md](LEARNER_TRIAL.md) for the next experiment. The scope remains mate in one.

A separate [difficulty research pilot](../research/artifacts/REPORT.md) now evaluates prediction of Lichess ratings on a public-data sample. It does not calibrate the trainer's composed lessons or establish learner-specific difficulty.

## Proposed focus

Teach players to explain and recognize checkmate, with verifiable board facts behind the instruction. A small collection with excellent teaching could be more useful than another large collection.

Basic ratings and tags are established features: [Lichess themes](https://lichess.org/training/themes), [Chess.com custom puzzles](https://www.chess.com/puzzles/learning), and [Puzzle Academy](https://chesspuzzle.net/Academy) already offer themes, difficulty selection, or structured learning. This was a limited survey, not proof that the ideas below are unique.

## 1. Explain every failed defence

After the solution, show the checking piece, why the king cannot move, why the checking piece cannot be captured, and why the check cannot be blocked. Explain pins and protected squares where they matter.

Generate structured board facts with legal-move analysis and render them as clear prose and board highlights. Hand-review early examples. Any optional language-model narration must stay grounded in those facts.

## 2. Explain the player's actual mistake

For a legal attempt that does not mate, show a concrete legal reply: an escape square, capture, or block. Distinguish a checking move that allows escape from a move that does not check and a move that stalemates. An illegal attempted move needs its own rules explanation.

The claim should be specific: this reply disproves mate in one. It need not be the engine's best move or prove that the attempted move loses the game.

## 3. Teach with near-identical positions

Offer pairs where one piece moves and changes the result: a mating move becomes only check, or a defender becomes pinned. Ask what changed before revealing the answer. Validate every generated variant; changes can introduce illegal positions or extra solutions.

## 4. Make difficulty explainable

Keep separate dimensions for the moving piece and move mechanics (capture, promotion, castling), mating pattern, and recognition demands (checking alternatives, protection relationships, hidden lines). A legal checking move is not automatically a plausible distraction; test that hypothesis with learners.

Begin with a provisional rubric rather than invented Elo. Later calibrate from first-attempt success, time, hints, and player skill, recording sample sizes and uncertainty. Keep assisted and previously seen attempts separate from fresh unassisted attempts.

## 5. Measure understanding beyond finding the move

Offer an optional follow-up: which piece stops the king escaping, or which change would break the mate? Use errors to select another example testing that concept. Track accuracy and speed separately so careful learners are not treated as weak simply because they take their time.

## Suggested first experiment

Create 10–20 reviewed positions with a complete mate explanation and one tempting incorrect move with a verified reply. Build a minimal playable board around those. Observe whether users can explain a new related position afterward before investing in a ranking algorithm or a large import pipeline.

Keep derived analysis separate from source puzzle records until the explanation and tagging formats have been tested on that small collection.
