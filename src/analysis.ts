import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

export type MoveInput = string | { from: Square; to: Square; promotion?: string };
export type SquareFact = { square: Square; reason: string; attackers: Square[] };
export type MateProof = {
  king: Square;
  checkers: Square[];
  escapes: SquareFact[];
  capture: string[];
  blocking: string[];
};
export type AttemptAnalysis = {
  status: "illegal" | "mate" | "check" | "stalemate" | "not-check";
  message: string;
  beforeFen: string;
  afterFen: string;
  move?: { san: string; from: Square; to: Square; piece: PieceSymbol; promotion?: string };
  tags: string[];
  reply?: { san: string; from: Square; to: Square; fen: string; explanation: string };
  proof?: MateProof;
};

const names: Record<PieceSymbol, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
export function pieceName(piece: PieceSymbol): string { return names[piece]; }
function other(color: Color): Color { return color === "w" ? "b" : "w"; }
function describe(chess: Chess, squares: Square[]): string {
  return squares.map((square) => `${names[chess.get(square)!.type]} on ${square}`).join(" and ");
}
function kingSquare(chess: Chess, color: Color): Square {
  return chess.board().flat().find((piece) => piece?.type === "k" && piece.color === color)!.square;
}
function at(file: number, rank: number): Square { return `${"abcdefgh"[file]}${rank + 1}` as Square; }
function coords(square: Square): [number, number] { return [square.charCodeAt(0) - 97, Number(square[1]) - 1]; }
function between(from: Square, to: Square): Square[] {
  const [ff, fr] = coords(from), [tf, tr] = coords(to);
  if (ff !== tf && fr !== tr && Math.abs(ff - tf) !== Math.abs(fr - tr)) return [];
  const dx = Math.sign(tf - ff), dy = Math.sign(tr - fr), squares: Square[] = [];
  for (let f = ff + dx, r = fr + dy; f !== tf || r !== tr; f += dx, r += dy) squares.push(at(f, r));
  return squares;
}

function illegalReason(chess: Chess, input: MoveInput): string {
  if (typeof input === "string") return "That notation does not describe a legal move here. Try a move such as Qg7, or select a piece and its destination on the board.";
  if (!/^[a-h][1-8]$/.test(input.from) || !/^[a-h][1-8]$/.test(input.to)) return "Choose two squares on the board.";
  const piece = chess.get(input.from), target = chess.get(input.to);
  if (!piece) return `There is no piece on ${input.from}.`;
  if (piece.color !== chess.turn()) return `It is ${chess.turn() === "w" ? "White" : "Black"}'s turn. Select one of that side's pieces.`;
  if (input.from === input.to) return "Choose a different destination square.";
  if (target?.color === piece.color) return `${input.to} is occupied by your own ${names[target.type]}.`;
  const [ff, fr] = coords(input.from), [tf, tr] = coords(input.to), dx = Math.abs(tf - ff), dy = tr - fr;
  const direction = piece.color === "w" ? 1 : -1;
  // Default FEN output hides an en passant target when capturing would expose the king.
  // Keep it here so the rejection explains king safety rather than pawn geometry.
  const ep = chess.fen({ forceEnpassantSquare: true }).split(" ")[3];
  if (piece.type === "p" && (tr === 0 || tr === 7) && !input.promotion) return "A pawn reaching the last rank must promote. Choose a queen, rook, bishop, or knight.";
  if (input.promotion && (!['q', 'r', 'b', 'n'].includes(input.promotion) || piece.type !== "p" || (tr !== 0 && tr !== 7))) return "Promotion is only available for a pawn reaching the last rank; choose queen, rook, bishop, or knight.";
  const geometry = piece.type === "n" ? dx * Math.abs(dy) === 2 :
    piece.type === "b" ? dx === Math.abs(dy) :
    piece.type === "r" ? dx === 0 || dy === 0 :
    piece.type === "q" ? dx === 0 || dy === 0 || dx === Math.abs(dy) :
    piece.type === "k" ? Math.max(dx, Math.abs(dy)) === 1 || (dx === 2 && dy === 0) :
    (dx === 0 && !target && (dy === direction || (dy === 2 * direction && fr === (piece.color === "w" ? 1 : 6)))) ||
    (dx === 1 && dy === direction && (!!target || input.to === ep));
  if (!geometry) return `A ${names[piece.type]} cannot move from ${input.from} to ${input.to} that way. Pawns move forward and capture diagonally; other pieces follow their own movement pattern.`;
  if (piece.type !== "n") {
    const blocker = between(input.from, input.to).find((square) => chess.get(square));
    if (blocker) return `The ${names[piece.type]}'s path is blocked by the ${names[chess.get(blocker)!.type]} on ${blocker}.`;
  }
  if (piece.type === "k" && dx === 2) return "Castling requires the appropriate castling right, a clear path, and a king that is not in check and does not cross or land on an attacked square.";
  const simulation = new Chess(chess.fen());
  simulation.remove(input.from);
  if (piece.type === "p" && input.to === ep && dx === 1 && !target) simulation.remove(at(tf, fr));
  simulation.remove(input.to);
  simulation.put({ color: piece.color, type: (input.promotion ?? piece.type) as PieceSymbol }, input.to);
  const king = kingSquare(simulation, piece.color);
  const attacks = simulation.attackers(king, other(piece.color));
  if (attacks.length) return `That move would leave your king on ${king} in check from the ${describe(simulation, attacks)}. You must keep your king safe.`;
  return "That move is not legal in this position. Check the piece's movement, your king's safety, and any special-move requirements.";
}

function mateProof(chess: Chess): MateProof {
  const defender = chess.turn(), attacker = other(defender), king = kingSquare(chess, defender);
  const checkers = chess.attackers(king, attacker);
  const [kf, kr] = coords(king), escapes: SquareFact[] = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if ((!df && !dr) || kf + df < 0 || kf + df > 7 || kr + dr < 0 || kr + dr > 7) continue;
    const square = at(kf + df, kr + dr), occupant = chess.get(square);
    if (occupant?.color === defender) {
      escapes.push({ square, attackers: [], reason: `${square} is occupied by the defending side's ${names[occupant.type]}.` });
      continue;
    }
    // Remove the king and any captured piece before testing attacks: this reveals x-rays.
    const simulation = new Chess(chess.fen());
    simulation.remove(king);
    simulation.remove(square);
    simulation.put({ type: "k", color: defender }, square);
    const attackers = simulation.attackers(square, attacker);
    escapes.push({ square, attackers, reason: `${square} is controlled by the ${describe(simulation, attackers)}${occupant ? `, so the king cannot capture the ${names[occupant.type]} there` : ""}.` });
  }
  const capture = checkers.map((square) => {
    const protectors = chess.attackers(square, attacker);
    return `The checking ${names[chess.get(square)!.type]} on ${square}${protectors.length ? ` is protected by the ${describe(chess, protectors)}, preventing capture by the king` : " cannot be captured in any legal reply that leaves the king safe"}.`;
  });
  capture.push("Legal-move enumeration confirms that no defending piece can capture a checker and leave the king safe.");
  const blocking = checkers.map((square) => {
    const piece = chess.get(square)!;
    const line = ['b', 'r', 'q'].includes(piece.type) ? between(square, king) : [];
    return line.length ? `The line from ${square} to ${king} passes through ${line.join(", ")}. No legal defensive move can block it and leave the king safe.` : `There is no intervening square between the checking ${names[piece.type]} on ${square} and the king. This check cannot be blocked.`;
  });
  if (checkers.length > 1) blocking.unshift("This is double check: a defence would have to remove both checks.");
  return { king, checkers, escapes, capture, blocking };
}

export function moveTags(move: Move, chessAfter: Chess): string[] {
  const tags = [names[move.piece]];
  if (move.isCapture() || move.isEnPassant()) tags.push("capture");
  if (move.isEnPassant()) tags.push("en passant");
  if (move.isKingsideCastle() || move.isQueensideCastle()) tags.push("castling");
  if (move.promotion) tags.push(move.promotion === "q" ? "promotion" : "underpromotion");
  if (!move.isCapture() && !move.isEnPassant() && !move.isKingsideCastle() && !move.isQueensideCastle()) tags.push("non-capture");
  if (chessAfter.inCheck()) {
    const checkers = chessAfter.attackers(kingSquare(chessAfter, chessAfter.turn()), other(chessAfter.turn()));
    if (checkers.length > 1) tags.push("double check");
    const movedSquares = [move.to];
    if (move.isKingsideCastle() || move.isQueensideCastle()) movedSquares.push(`${move.isKingsideCastle() ? 'f' : 'd'}${move.to[1]}` as Square);
    if (checkers.some((square) => !movedSquares.includes(square))) tags.push("discovered check");
  }
  return tags;
}

export function analyzeAttempt(fen: string, input: MoveInput): AttemptAnalysis {
  const chess = new Chess(fen);
  const result: AttemptAnalysis = { status: "illegal", beforeFen: fen, afterFen: fen, message: "", tags: [] };
  let move: Move;
  try { move = chess.move(input); }
  catch { result.message = illegalReason(chess, input); return result; }
  // chess.js also accepts analysis-only null moves. Passing is not a legal player move.
  if (move.from === move.to) {
    result.message = "You cannot pass a turn in chess. Choose a legal move with one of your pieces.";
    return result;
  }
  result.move = { san: move.san, from: move.from, to: move.to, piece: move.piece, promotion: move.promotion };
  result.afterFen = chess.fen();
  result.tags = moveTags(move, chess);
  if (chess.isCheckmate()) {
    result.status = "mate";
    result.message = `${move.san} is checkmate. The king is in check and the defending side has no legal reply.`;
    result.proof = mateProof(chess);
    return result;
  }
  if (chess.isStalemate()) {
    result.status = "stalemate";
    result.message = `${move.san} is stalemate, not checkmate. The king is not in check, but the defending side has no legal move.`;
    return result;
  }
  result.status = chess.inCheck() ? "check" : "not-check";
  const checkers = chess.attackers(kingSquare(chess, chess.turn()), other(chess.turn()));
  const replies = chess.moves({ verbose: true });
  const reply = replies.find((candidate) => candidate.piece === "k") ??
    replies.find((candidate) => checkers.includes(candidate.to)) ?? replies[0];
  if (reply) {
    const explanation = result.status === "not-check" ? `${reply.san} is one legal reply; the king was not in check.` :
      reply.piece === "k" ? (reply.isCapture() ? `The king can safely capture the ${names[reply.captured!]} on ${reply.to}.` : `The king can escape to ${reply.to}.`) :
      checkers.includes(reply.to) ? `The ${names[reply.piece]} can capture the checker on ${reply.to}.` :
      `The ${names[reply.piece]} can move to ${reply.to} to answer the check.`;
    chess.move(reply.san);
    result.reply = { san: reply.san, from: reply.from, to: reply.to, fen: chess.fen(), explanation };
  }
  result.message = result.status === "check" ? `${move.san} gives check, but it is not mate. ${result.reply?.explanation ?? "A legal defence remains."}` :
    `${move.san} does not give check. Checkmate must put the king in check and leave no legal reply.`;
  return result;
}
