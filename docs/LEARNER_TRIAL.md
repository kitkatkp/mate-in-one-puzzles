# A small learner trial

The prototype is ready to try with people. No human study has been performed, and the current difficulty bands are provisional. The goal of an early trial is to find confusing explanations and promising teaching patterns, not to validate an Elo scale.

## Prepare

1. Run `npm ci` and `npm run dev`, then open the printed local URL.
2. Recruit three to five willing learners with differing chess experience. The preview listens only on the host computer; use the same device or separately host the static `dist/` build if remote access is needed.
3. Open Your notebook and assign each learner a distinct nickname. Previously opened positions are treated as seen for that label. Choose a new label for a fresh session; restarting a puzzle does not erase its exposure history.
4. Explain the task and how to select pieces, use typed moves, and request help. Do not tell them the solution. Tell them that hints and careful thinking are welcome.

## Walk through a pair

1. Let the learner attempt the first position. Ask them to think aloud if comfortable. Note whether the board, turn indicator, and input controls are clear.
2. If they make a mistake, let them play the legal defensive reply and retry. Ask what the reply demonstrates.
3. After a solve or solution view, have them read the explanation and inspect an escape square. Ask them to explain the mate in their own words.
4. Have them answer the understanding question before revealing the answer through feedback.
5. Open the changed position. Ask what changed and whether the earlier move still works. Let them solve it and answer its question.
6. Repeat for a few pairs, stopping when tired. A short, thoughtful session is more useful than rushing through all ten.

The learner can choose any correct mate. Some positions have multiple solutions; the authored explanation follows the preferred example, while generated board facts follow the move actually selected. Questions explicitly name their example move when needed.

## Gather evidence

Use Export study results after each session. The downloaded JSON includes all learner labels on that browser, visit IDs, puzzle IDs, timestamps, elapsed milliseconds, moves and outcomes, assistance, solution views, and first understanding answers. Keep participant notes separately and avoid identifying personal details in labels.

The notebook's fresh-first-try denominator includes first moves on previously unseen positions that were submitted without hints or a solution view. Illegal move attempts count. Retries can contribute to eventual solves, but do not turn an incorrect first attempt into a correct one. A revealed solution alone does not count as a solve. Hints and repeated exposures remain separate from fresh attempts.

Elapsed time includes reading, interruptions, and time in other browser tabs. It is not a measure of active calculation, and it is not folded into a skill score.

Useful notes:

- What did the learner think the checking piece was?
- Which escape or capture did they overlook?
- Could they explain why the changed position differed?
- Did highlighting a square resolve their confusion?
- Was the wording too technical or too vague?
- Could they answer the understanding question without guessing?

## Interpret cautiously

The two positions in a pair are deliberately similar, themes are visible, and answers are revealed during instruction. Success on the partner can reflect short-term memory, so it is not an independent demonstration of transfer or retained skill.

For a later study, add independently composed held-out positions, hide theme labels, randomize presentation, and test again after a delay. A comparison group would be needed to estimate whether the explanations teach more effectively than ordinary solution feedback. Do not compare difficulty bands from a handful of attempts without recording sample sizes and learner experience.

## Make the next decision

First revise explanations and questions that repeatedly confuse people. Then expand the concepts that learners can explain on a genuinely new position. Only after collecting enough representative unassisted attempts should you fit or calibrate numerical difficulty. Keep recognition demands, move mechanics, and empirical difficulty as separate fields.
