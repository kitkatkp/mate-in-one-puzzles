# Prototype verification

## Automated checks

`npm run check` checks TypeScript, executes tests, validates both datasets, and bundles the static app. The move-analysis tests walk every legal move from each teaching position, verify classification against the chess rules, and confirm that each offered defensive reply is legal.

Coverage includes:

- Original invalid sample and adjacent kings.
- Invalid record shapes, FENs, duplicate IDs/positions/solutions, inconsistent turn and state, missing mating solutions.
- All ten lessons, reciprocal pairs, exact one-piece board differences, complete solution sets, preferred solutions, and verified teaching counterexamples.
- King escapes, captures, interpositions, non-checks, stalemate, and illegal moves caused by geometry, blockers, promotion requirements, or king exposure.
- Captures, all promotion choices, rook underpromotion mate, castling mate, en passant mate, and discovered checks.
- Every neighboring king square in each generated mate explanation, with captured pieces and the old king square removed before checking attacks.
- First-try statistics that exclude assistance/revisits, keep retries distinct, and separate understanding questions from move outcomes.
- CLI behavior from another working directory, missing files, and invalid JSON.

## Browser walkthrough, October 19, 2026

Verified in the in-app browser against the local built application:

- Board renders with coordinates, distinct pieces, lesson navigation, and legal move selection.
- Solving Qh6# in the first king-support position generates mate facts and the understanding question.
- Qh6+ in the changed position produces Kg8 as a legal escape; playing the reply updates the board.
- Comparison shows the reference king on f7; returning restores the exercise. Retry with Qg7# succeeds.
- Notebook records two eventual solves with one correct fresh first try out of two, and a separate correct understanding answer.
- JSON study export downloads and contains raw visit and move events.
- A Black-to-move lesson uses Black's perspective and accepts Nf2#.
- Keyboard selection, arrow navigation, and Enter execute a move.
- Mobile viewport at 390 × 844 displays a square board without horizontal page overflow. Lesson navigation scrolls within its own row.
- Browser console had no errors or warnings during the walkthrough.

The browser walkthrough is manual verification, not a committed browser automation suite. After later changes, repeat the relevant interactions rather than treating this record as proof of the new state.

## Practical limits

The application and most of the automated checks use the same `chess.js` implementation. They check consistency and catch errors in our use of the library; they are not an independent chess-engine audit. Arbitrary prose is not automatically proven by a passing move test.

The app runs entirely in the browser after loading static assets. There is no API/database boundary or remote service. Local storage is specific to the browser and origin. Exports are manual; no data is sent to a server by the app.

This is a teaching prototype, not a calibrated ranking system. The explanation API expects positions validated by the curriculum. Local consistency validation does not prove historical reachability. Human usefulness, retention, and difficulty need learner evidence; see LEARNER_TRIAL.md.

## Follow-up correctness audit

The follow-up audit found and fixed:

- An illegal en passant capture that would expose the player's king was rejected correctly but described as invalid pawn movement. Rejection now retains the original en passant target and explains the exposed king and attacking rook. A regression test covers the position.
- Reference comparison could leave the other position's mate explanation and checker highlights visible. Comparison now hides those until returning to the exercise. Browser verification confirmed zero explanation panels/checker highlights in reference mode and restoration of the correct queen and explanation afterward.
- The second protected-checker lesson described queen support too vaguely. It now explains Bf6# precisely: the bishop checks h8, the queen on g4 controls g7 and g8, and the black pawn occupies h7. A targeted test covers those facts and confirms that the queen does not protect the bishop on f6.
- Understanding questions now explicitly tell the learner to consider the move named in the question from the starting position, since a chosen alternate solution may leave a different board on screen.

All ten saved solution sets still pass validation. The expanded suite has 25 passing tests. This audit did not establish that every possible explanation edge case is correct, or perform an independent engine or human chess-expert review.
