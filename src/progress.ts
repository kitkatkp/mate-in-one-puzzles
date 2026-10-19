export type StudyEvent = {
  type: "visit" | "move" | "hint" | "reveal" | "understanding";
  learner: string;
  visitId: string;
  puzzleId: string;
  at: string;
  elapsedMs: number;
  seenBefore?: boolean;
  assisted?: boolean;
  move?: string;
  outcome?: "illegal" | "mate" | "check" | "stalemate" | "not-check";
  correct?: boolean;
  choice?: number;
};
export type StudyLog = { version: 1; events: StudyEvent[] };
export const STORAGE_KEY = "mate-lab-study-v1";
export function emptyLog(): StudyLog { return { version: 1, events: [] }; }

export function parseStudyLog(raw: string | null): StudyLog {
  if (!raw) return emptyLog();
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || parsed.version !== 1 || !("events" in parsed) || !Array.isArray(parsed.events)) throw new Error("Unsupported study data");
  for (const event of parsed.events) {
    if (!event || typeof event !== "object" || !["visit", "move", "hint", "reveal", "understanding"].includes(event.type) ||
        ![event.learner, event.visitId, event.puzzleId, event.at].every((value) => typeof value === "string" && value.length > 0) ||
        !Number.isFinite(event.elapsedMs) || event.elapsedMs < 0 ||
        (event.type === "visit" && typeof event.seenBefore !== "boolean") ||
        (event.type === "move" && (typeof event.assisted !== "boolean" || typeof event.move !== "string" || !["illegal", "mate", "check", "stalemate", "not-check"].includes(event.outcome))) ||
        (event.type === "understanding" && (typeof event.correct !== "boolean" || !Number.isInteger(event.choice) || event.choice < 0))) throw new Error("Invalid study event");
  }
  return parsed as StudyLog;
}

export function studyStats(events: StudyEvent[], learner: string, puzzleIds?: string[]) {
  const relevant = events.filter((event) => event.learner === learner && (!puzzleIds || puzzleIds.includes(event.puzzleId)));
  const visits = relevant.filter((event) => event.type === "visit");
  const firstMoves = visits.flatMap((visit) => {
    const move = relevant.find((event) => event.visitId === visit.visitId && event.type === "move");
    return move && !visit.seenBefore && !move.assisted ? [move] : [];
  });
  const successes = firstMoves.filter((move) => move.outcome === "mate");
  const answers = relevant.filter((event, index, all) => event.type === "understanding" && all.findIndex((candidate) => candidate.type === "understanding" && candidate.visitId === event.visitId) === index);
  return {
    freshAttempts: firstMoves.length,
    firstTryCorrect: successes.length,
    firstTryRate: firstMoves.length ? successes.length / firstMoves.length : null,
    meanSuccessSeconds: successes.length ? successes.reduce((total, move) => total + move.elapsedMs, 0) / successes.length / 1000 : null,
    solved: new Set(relevant.filter((event) => event.type === "move" && event.outcome === "mate").map((event) => event.puzzleId)).size,
    hints: relevant.filter((event) => event.type === "hint").length,
    reveals: relevant.filter((event) => event.type === "reveal").length,
    understandingAnswered: answers.length,
    understandingCorrect: answers.filter((event) => event.correct).length,
  };
}
