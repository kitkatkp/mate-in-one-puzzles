import { Chess, validateFen, type Color, type Square } from "chess.js";
import type { Puzzle } from "./types";

export type ValidationResult = {
  puzzleId: string;
  messages: string[];
  valid: boolean;
};

function schemaErrors(input: unknown): string[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return ["Puzzle must be an object"];
  }
  const record = input as Record<string, unknown>;
  const messages: string[] = [];
  for (const key of ["id", "fen"] as const) {
    if (typeof record[key] !== "string" || !record[key].trim()) {
      messages.push(`${key} must be a non-empty string`);
    }
  }
  if (record.sideToMove !== "w" && record.sideToMove !== "b") {
    messages.push('sideToMove must be "w" or "b"');
  }
  if (!Array.isArray(record.solutions) || record.solutions.length === 0 ||
      record.solutions.some((move) => typeof move !== "string" || !move.trim())) {
    messages.push("solutions must be a non-empty array of non-empty SAN strings");
  }
  return messages;
}

// Local consistency checks, not a proof of reachability from the initial position.
function positionErrors(chess: Chess, fen: string): string[] {
  const messages: string[] = [];
  const pieces = chess.board().flat().filter((piece) => piece !== null);
  const opponent: Color = chess.turn() === "w" ? "b" : "w";
  const king = pieces.find((piece) => piece.type === "k" && piece.color === opponent)!;
  if (chess.isAttacked(king.square, chess.turn())) {
    messages.push("Illegal position: the side not to move is already in check");
  }
  for (const color of ["w", "b"] as const) {
    const own = pieces.filter((piece) => piece.color === color);
    const pawns = own.filter((piece) => piece.type === "p").length;
    if (own.length > 16 || pawns > 8) {
      messages.push(`Illegal material count for ${color}: at most 16 pieces and 8 pawns`);
    }
    const extraPieces = ([['q', 1], ['r', 2], ['b', 2], ['n', 2]] as const)
      .reduce((sum, [type, original]) => sum + Math.max(0, own.filter((piece) => piece.type === type).length - original), 0);
    if (extraPieces > 8 - pawns) messages.push(`Illegal material for ${color}: not enough missing pawns for promotions`);
  }
  const fields = fen.split(/\s+/);
  if (!/^(?:-|K?Q?k?q?)$/.test(fields[2])) messages.push("Invalid castling rights: use KQkq order without duplicates");
  if (!/^\d+$/.test(fields[4]) || !/^[1-9]\d*$/.test(fields[5])) messages.push("Invalid FEN move counters: expected whole numbers");
  for (const [right, color, kingSquare, rookSquare] of [
    ["K", "w", "e1", "h1"], ["Q", "w", "e1", "a1"],
    ["k", "b", "e8", "h8"], ["q", "b", "e8", "a8"],
  ] as const) {
    if (fields[2].includes(right) &&
        (chess.get(kingSquare)?.type !== "k" || chess.get(kingSquare)?.color !== color ||
         chess.get(rookSquare)?.type !== "r" || chess.get(rookSquare)?.color !== color)) {
      messages.push(`Invalid castling right ${right}: king and rook must be on their starting squares`);
    }
  }
  if (fields[3] !== "-") {
    const target = fields[3] as Square;
    const file = target[0];
    const pawnSquare = `${file}${chess.turn() === "w" ? "5" : "4"}` as Square;
    const origin = `${file}${chess.turn() === "w" ? "7" : "2"}` as Square;
    if (chess.get(target) || chess.get(origin) || chess.get(pawnSquare)?.type !== "p" ||
        chess.get(pawnSquare)?.color !== opponent || Number(fields[4]) !== 0) {
      messages.push("Invalid en passant state: expected a just-advanced opposing pawn and empty origin and target");
    }
  }
  return messages;
}

export function getLegalMateInOneMoves(chess: Chess): string[] {
  const mates: string[] = [];
  for (const move of chess.moves({ verbose: true })) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
    try {
      if (chess.isCheckmate()) mates.push(move.san);
    } finally {
      chess.undo();
    }
  }
  return mates;
}

export function validatePuzzles(input: unknown): ValidationResult[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [{ puzzleId: "database", valid: false, messages: ["Puzzle database must be a non-empty array"] }];
  }
  const ids = new Set<string>();
  const positions = new Set<string>();
  return input.map((record: unknown, index) => {
    const messages = schemaErrors(record);
    const result: ValidationResult = { puzzleId: `record-${index + 1}`, messages, valid: false };
    if (messages.length > 0) return result;
    const puzzle = record as Puzzle;
    result.puzzleId = puzzle.id;
    const id = puzzle.id.trim();
    if (ids.has(id)) messages.push("Duplicate puzzle ID detected");
    ids.add(id);
    const fen = puzzle.fen.trim();
    const validation = validateFen(fen);
    if (!validation.ok) {
      messages.push(`Invalid FEN: ${validation.error}`);
      return result;
    }
    const chess = new Chess(fen);
    messages.push(...positionErrors(chess, fen));
    if (chess.turn() !== puzzle.sideToMove) messages.push("sideToMove does not match FEN turn");
    // Ignore move counters and normalize rights/irrelevant en passant targets.
    const position = chess.fen().split(" ").slice(0, 4).join(" ");
    if (positions.has(position)) messages.push("Duplicate position detected (ignoring move counters)");
    positions.add(position);
    if (messages.length > 0) return result;
    const mates = getLegalMateInOneMoves(chess);
    const solutions = puzzle.solutions.map((move) => move.trim());
    if (mates.length === 0) messages.push("No legal mate-in-one moves found for this position");
    if (new Set(solutions).size !== solutions.length) messages.push("Duplicate saved solutions detected");
    const incorrect = solutions.filter((move) => !mates.includes(move));
    const missing = mates.filter((move) => !solutions.includes(move));
    if (incorrect.length) messages.push(`Saved solutions are not all correct: ${incorrect.join(", ")}`);
    if (missing.length) messages.push(`Missing correct mate-in-one moves: ${missing.join(", ")}`);
    result.valid = messages.length === 0;
    return result;
  });
}
