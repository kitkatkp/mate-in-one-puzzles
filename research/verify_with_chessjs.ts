import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Chess } from "chess.js";

const folder = resolve("research/artifacts");
const positions = readFileSync(resolve(folder, "positions.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line) as {
  puzzle_id: string; fen: string; legal_moves: string[]; checking_moves: string[]; mating_moves: string[]; check_reply_counts: Record<string, number>;
});
const differences: { puzzleId: string; field: string }[] = [];
const equalMoves = (left: string[], right: string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
for (const [index, position] of positions.entries()) {
  const board = new Chess(position.fen);
  const moves = board.moves({ verbose: true });
  const checks: string[] = [], mates: string[] = [];
  for (const move of moves) {
    if (!/[+#]$/.test(move.san)) continue;
    checks.push(move.lan);
    board.move({ from: move.from, to: move.to, promotion: move.promotion });
    if (board.isCheckmate()) mates.push(move.lan);
    if (board.moves().length !== position.check_reply_counts[move.lan]) differences.push({ puzzleId: position.puzzle_id, field: `reply count after ${move.lan}` });
    board.undo();
  }
  for (const [field, actual, expected] of [
    ["legal moves", moves.map((move) => move.lan), position.legal_moves],
    ["checking moves", checks, position.checking_moves], ["mating moves", mates, position.mating_moves],
  ] as const) if (!equalMoves(actual, expected)) differences.push({ puzzleId: position.puzzle_id, field });
  if ((index + 1) % 500 === 0) console.log(`Cross-checked ${index + 1}/${positions.length} positions`);
}
const report = { compared: positions.length, positions_sha256: createHash("sha256").update(readFileSync(resolve(folder, "positions.jsonl"))).digest("hex"), differences, implementations: ["python-chess 1.11.2", "chess.js 1.4.0"], scope: "Legal, checking, mating move sets and reply counts after every check; does not prove prose or human difficulty.", passed: differences.length === 0 };
writeFileSync(resolve(folder, "independent_verification.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
if (differences.length) process.exitCode = 1;
