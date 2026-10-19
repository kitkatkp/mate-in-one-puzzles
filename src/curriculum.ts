import { Chess } from "chess.js";
import { lessons } from "../data/lessons";
import { analyzeAttempt } from "./analysis";
import { validatePuzzles, type ValidationResult } from "./validation";

export { lessons };

export function validateCurriculum(): ValidationResult[] {
  const results = validatePuzzles(lessons);
  for (const [index, puzzle] of lessons.entries()) {
    const messages = results[index].messages;
    const partner = lessons.find((candidate) => candidate.id === puzzle.partnerId);
    if (!partner || partner.partnerId !== puzzle.id || partner.pairId !== puzzle.pairId) messages.push("Teaching pair must link reciprocally");
    if (!puzzle.solutions.includes(puzzle.primarySolution)) messages.push("Primary solution must be a saved mating solution");
    const question = puzzle.understanding;
    if (question.correctIndex < 0 || question.correctIndex >= question.choices.length) messages.push("Understanding question must have a valid answer");
    if (partner) {
      const board = new Chess(puzzle.fen), previous = new Chess(partner.fen);
      const from = puzzle.comparison.from as Parameters<Chess["get"]>[0];
      const to = puzzle.comparison.to as Parameters<Chess["get"]>[0];
      const piece = previous.get(from);
      if (!piece || previous.get(to) || board.get(from) || JSON.stringify(board.get(to)) !== JSON.stringify(piece)) messages.push("Comparison must describe the relocated piece");
      previous.remove(from);
      if (piece) previous.put(piece, to);
      if (previous.fen().split(" ")[0] !== board.fen().split(" ")[0]) messages.push("A teaching pair must differ by exactly one relocated piece");
    }
    if (results[index].valid) {
      const mistake = analyzeAttempt(puzzle.fen, puzzle.commonMistake.move);
      if (mistake.status === "mate" || mistake.status === "illegal" || mistake.reply?.san !== puzzle.commonMistake.reply) messages.push("The teaching counterexample must have its verified legal reply");
      for (const solution of puzzle.solutions) {
        const analysis = analyzeAttempt(puzzle.fen, solution);
        if (analysis.status !== "mate" || !analysis.proof || analysis.proof.escapes.some((fact) => !fact.attackers.length && !new Chess(analysis.afterFen).get(fact.square))) messages.push(`Unverified explanation for ${solution}`);
      }
    }
    results[index].valid = messages.length === 0;
  }
  return results;
}
