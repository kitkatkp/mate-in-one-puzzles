import assert from "node:assert/strict";
import test from "node:test";
import { emptyLog, parseStudyLog, studyStats, type StudyEvent } from "../src/progress";

const base = { learner: 'A', visitId: 'v1', puzzleId: 'p1', at: '2026-10-19T12:00:00Z', elapsedMs: 0 };
test("fresh first-try accuracy excludes hints, revisits, retries, and other learners", () => {
  const events: StudyEvent[] = [
    { ...base, type: 'visit', seenBefore: false },
    { ...base, type: 'move', move: 'Qg7', outcome: 'check', assisted: false, elapsedMs: 3000 },
    { ...base, type: 'move', move: 'Qg8', outcome: 'mate', assisted: false, elapsedMs: 9000 },
    { ...base, visitId: 'v2', puzzleId: 'p2', type: 'visit', seenBefore: false },
    { ...base, visitId: 'v2', puzzleId: 'p2', type: 'move', move: 'Re8', outcome: 'mate', assisted: false, elapsedMs: 5000 },
    { ...base, visitId: 'v3', type: 'visit', seenBefore: true },
    { ...base, visitId: 'v3', type: 'move', move: 'Qg8', outcome: 'mate', assisted: false },
    { ...base, visitId: 'v4', puzzleId: 'p3', type: 'visit', seenBefore: false },
    { ...base, visitId: 'v4', puzzleId: 'p3', type: 'hint' },
    { ...base, visitId: 'v4', puzzleId: 'p3', type: 'move', move: 'Qg8', outcome: 'mate', assisted: true },
    { ...base, learner: 'B', visitId: 'v5', type: 'visit', seenBefore: false },
    { ...base, learner: 'B', visitId: 'v5', type: 'move', move: 'Qg8', outcome: 'mate', assisted: false },
  ];
  const stats = studyStats(events, 'A');
  assert.equal(stats.freshAttempts, 2);
  assert.equal(stats.firstTryRate, .5);
  assert.equal(stats.meanSuccessSeconds, 5);
  assert.equal(stats.solved, 3);
  assert.equal(studyStats(events, 'A', ['p1']).firstTryRate, 0);
});

test("reveal-only visits do not count as solved; understanding uses the first answer per visit", () => {
  const events: StudyEvent[] = [
    { ...base, type: 'visit', seenBefore: false },
    { ...base, type: 'reveal' },
    { ...base, type: 'understanding', choice: 0, correct: false },
    { ...base, type: 'understanding', choice: 1, correct: true },
  ];
  const stats = studyStats(events, 'A');
  assert.equal(stats.solved, 0);
  assert.equal(stats.freshAttempts, 0);
  assert.equal(stats.firstTryRate, null);
  assert.equal(stats.understandingAnswered, 1);
  assert.equal(stats.understandingCorrect, 0);
});

test("saved study data is validated before being used", () => {
  assert.deepEqual(parseStudyLog(null), emptyLog());
  const events: StudyEvent[] = [{ ...base, type: 'visit', seenBefore: false }];
  assert.deepEqual(parseStudyLog(JSON.stringify({ version: 1, events })), { version: 1, events });
  for (const input of ['oops', '{}', '{"version":2,"events":[]}', JSON.stringify({ version: 1, events: [{ ...base, type: 'move', move: 'Qh6', outcome: 'mate' }] }), JSON.stringify({ version: 1, events: [{ ...base, type: 'visit', seenBefore: false, elapsedMs: -1 }] })]) {
    assert.throws(() => parseStudyLog(input));
  }
});
