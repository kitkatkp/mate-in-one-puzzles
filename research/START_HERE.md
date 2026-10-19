# Your first week with the difficulty experiment

The goal is a project you can explain honestly next week. The first experiment is implemented and has real results. Your work this week is to reproduce it, question it, and make one small improvement you understand.

You do not need to understand every line before starting. Begin with the data and the simple score. The boosted-tree comparison is an extension; you can present the mathematical score and linear regression confidently without claiming expertise in every model.

## Read these first

1. `artifacts/REPORT.md`: the question, actual results, and limitations.
2. `features.py`: how board facts become numbers.
3. `experiment.py`: find `make_splits`, `candidates`, and the line selecting a model on validation MAE.

## What the result currently says

In a fixed 3,000-position sample, the checking-ratio score has a held-out Spearman correlation of about 0.522 with Lichess ratings. A linear model with 24 board features reaches about 0.600. A validation-selected boosted-tree model reaches about 0.619, with mean absolute error about 191 versus 241 rating points for the constant baseline.

This is evidence for this dataset and split. It is not a new universal chess rating scale, a measurement of individual learning, or proof of causal explanations. The sample is restricted to a quality-filtered prefix of the database.

## Day 1: understand a single row (45–60 minutes)

Open `data/lichess_mate_in_one.csv`. Its columns include an ID, a board position, a move sequence, and a rating.

For puzzle `000rZ`, the stored FEN says White to move. The sequence begins `d4e6 d6h2`. Apply `d4e6` first: this is the opponent's move, leaving Black to solve the puzzle with `d6h2`.

Read `solver_board` in `features.py`. Locate the checks that establish this interpretation. Explain why measuring the original FEN would describe the wrong puzzle.

Checkpoint: explain FEN, UCI moves, and which side is the solver in this example. You can ask for help with any of these.

## Day 2: understand the mathematical score (45–60 minutes)

The proposed score is `log(checking_moves / mating_moves)`. Its assumption is that a solver considers checks uniformly. It is the negative logarithm of that model's success probability.

Try a position with six checking moves and two mating moves. Work out the assumed success probability and score. Then explain why a person might consider the checks unequally.

Read `extract` in `features.py`. Trace one legal move through `push`, the reply count, and `pop`. Explain why the code restores the board after every candidate.

## Day 3: understand evaluation (60–90 minutes)

The split has 1,800 training, 600 validation, and 600 test positions. Games are kept in one split. Exact and rank-mirrored color-swapped duplicates are removed before splitting.

- Training data fits coefficients and scaling.
- Validation data chooses model settings and the model to report.
- Test data measures the frozen choice on held-out games.

MAE is the average absolute prediction error, in rating points. Spearman measures whether larger predictions correspond to larger observed ratings, regardless of the prediction scale. A constant predictor has no useful ranking, so its Spearman is undefined.

Checkpoint: calculate MAE for true ratings `[900, 1100, 1300]` and predictions `[1000, 1000, 1000]`. Explain why selecting the best test result after many experiments would weaken the evaluation.

## Day 4: reproduce the experiment (60–90 minutes)

Follow README.md in this folder. Keep the committed CSV snapshot unchanged so you can reproduce v1. Run the tests, feature extraction, independent verification, and experiment. Compare your output with the written report; minor cross-platform floating-point differences are possible.

Checkpoint: explain why two chess implementations agreeing is useful, and why that does not validate a human difficulty model.

## Day 5: investigate errors (60–90 minutes)

Open `artifacts/test_predictions.csv` and inspect three high-error examples. A simple script can sort rows by `absolute_error`. Describe what the model may have missed, and consider label noise and sampling bias as alternative explanations.

Do not tune v1 to its exposed test set. Write your hypotheses down. Future feature changes need validation work and a new held-out sample for confirmatory claims.

Checkpoint: explain one result that supported your expectations and one that surprised you. Distinguish an association in the model from a causal explanation of a learner's difficulty.

## Day 6: make one small, understood contribution (60–90 minutes)

Examples: improve the explanation of one feature, add a regression test for a chess edge case, or improve the report's presentation. An exploratory model change is also possible, but label it exploratory and do not replace the v1 holdout claim after tuning to its errors.

Write a short note describing the change, why you made it, and how you checked it. Be prepared to explain your use of coding assistance.

## Day 7: prepare the interview walkthrough (60–90 minutes)

Show the trainer and its difficulty report. Explain the research question, the simple score, the train/validation/test split, the measured result, and one failure. Ask a friend to interrupt with questions.

Keep the résumé claim proportional to what you understand. A possible bullet, once you can reproduce and explain it:

> Built and evaluated a chess-puzzle difficulty pipeline using 24 board-derived features across 3,000 rated mate-in-one positions; compared heuristic, linear, and boosted-tree models on source-game-separated data, achieving 191-point held-out MAE versus a 241-point constant baseline in a fixed pilot.

Use the exact sample qualification. Do not claim improved learning, novel research, production scale, or a measured player rating.

## Questions you should be able to answer

1. What does the model predict, and what does it not predict?
2. Why is the stored Lichess FEN not the solver's position?
3. Why is the raw score not itself an Elo rating?
4. What are the units of MAE, and what does Spearman measure?
5. Where are the ratings excluded from the feature inputs?
6. What prevents source-game leakage?
7. Why does the reported 21% error reduction not imply 21% better learning?
8. What would you need to check on a new dataset?
