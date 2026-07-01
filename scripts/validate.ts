import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Chess, validateFen } from "chess.js";
import type { Puzzle } from "../src/types";

type ValidationResult = {
  puzzleId: string;
  messages: string[];
  valid: boolean;
};

function loadPuzzles(): Puzzle[] {
  const filePath = join(process.cwd(), "data", "puzzles.json");
  const content = readFileSync(filePath, "utf8");
  const puzzles = JSON.parse(content) as Puzzle[];
  return puzzles;
}

function getLegalMateInOneMoves(chess: Chess): string[] {
  const moves = chess.moves({ verbose: true });
  const legalMateMoves: string[] = [];

  for (const move of moves) {
    const clone = new Chess(chess.fen());
    clone.move({ from: move.from, to: move.to, promotion: move.promotion });
    if (clone.isCheckmate()) {
      legalMateMoves.push(move.san);
    }
  }

  return legalMateMoves;
}

function validatePuzzle(puzzle: Puzzle, seenFens: Set<string>): ValidationResult {
  const messages: string[] = [];
  let valid = true;

  if (seenFens.has(puzzle.fen)) {
    messages.push("Duplicate FEN detected");
    valid = false;
  }

  seenFens.add(puzzle.fen);

  const fenValidation = validateFen(puzzle.fen);
  if (!fenValidation.ok) {
    messages.push(`Invalid FEN: ${fenValidation.error ?? "unknown error"}`);
    valid = false;
    return { puzzleId: puzzle.id, messages, valid };
  }

  const chess = new Chess();
  try {
    chess.load(puzzle.fen);
  } catch (error) {
    messages.push(`Failed to load FEN into chess board: ${String(error)}`);
    valid = false;
    return { puzzleId: puzzle.id, messages, valid };
  }

  const currentTurn = chess.turn();
  if (currentTurn !== puzzle.sideToMove) {
    messages.push(`sideToMove does not match FEN turn: expected ${puzzle.sideToMove}, got ${currentTurn}`);
    valid = false;
  }

  const mateInOneMoves = getLegalMateInOneMoves(chess);
  if (mateInOneMoves.length === 0) {
    messages.push("No legal mate-in-one moves found for this position");
    valid = false;
  }

  if (puzzle.solutions.length === 0) {
    messages.push("Puzzle has no saved solutions");
    valid = false;
  }

  const normalizedSolutions = puzzle.solutions.map((solution) => solution.trim());
  const invalidSavedSolutions = normalizedSolutions.filter(
    (solution) => !mateInOneMoves.includes(solution)
  );

  if (invalidSavedSolutions.length > 0) {
    messages.push(
      `Saved solutions are not all correct: ${invalidSavedSolutions.join(", ")}`
    );
    valid = false;
  }

  const missingSolutions = mateInOneMoves.filter(
    (move) => !normalizedSolutions.includes(move)
  );
  if (missingSolutions.length > 0) {
    messages.push(
      `Missing correct mate-in-one moves: ${missingSolutions.join(", ")}`
    );
    valid = false;
  }

  return { puzzleId: puzzle.id, messages, valid };
}

function main(): void {
  const puzzles = loadPuzzles();
  const seenFens = new Set<string>();
  const results = puzzles.map((puzzle) => validatePuzzle(puzzle, seenFens));

  const errors = results.filter((result) => !result.valid);
  const successCount = results.length - errors.length;

  for (const result of results) {
    if (result.valid) {
      console.log(`✅ [${result.puzzleId}] Valid puzzle`);
    } else {
      console.error(`❌ [${result.puzzleId}] Invalid puzzle:`);
      for (const message of result.messages) {
        console.error(`   - ${message}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\nValidation failed: ${errors.length} of ${results.length} puzzles have issues.`);
    process.exit(1);
  }

  console.log(`\nAll ${successCount} puzzles passed validation.`);
}

main();
