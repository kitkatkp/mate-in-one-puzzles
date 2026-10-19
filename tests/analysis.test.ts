import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";
import { analyzeAttempt } from "../src/analysis";
import { lessons, validateCurriculum } from "../src/curriculum";

test("ten teaching positions form five verified pairs with complete solution sets", () => {
  const results = validateCurriculum();
  assert.equal(results.length, 10);
  assert.equal(new Set(lessons.map((puzzle) => puzzle.pairId)).size, 5);
  assert.ok(results.every((result) => result.valid), JSON.stringify(results.filter((result) => !result.valid)));
  assert.ok(lessons.some((puzzle) => puzzle.sideToMove === "b"));
});

test("every legal move in the curriculum is classified correctly and every offered reply is legal", () => {
  for (const puzzle of lessons) for (const move of new Chess(puzzle.fen).moves()) {
    const result = analyzeAttempt(puzzle.fen, move);
    const board = new Chess(puzzle.fen);
    board.move(move);
    assert.equal(result.afterFen, board.fen());
    assert.equal(result.status === "mate", board.isCheckmate(), `${puzzle.id} ${move}`);
    assert.equal(result.status === "stalemate", board.isStalemate());
    if (result.status === "check" || result.status === "not-check") {
      assert.ok(result.reply, `${puzzle.id} ${move} needs a concrete legal reply`);
      assert.ok(board.moves().includes(result.reply.san));
      board.move(result.reply.san);
      assert.equal(result.reply.fen, board.fen());
    }
    if (result.proof) {
      assert.ok(board.inCheck());
      assert.deepEqual(board.moves(), []);
      const defender = board.turn(), attacker = defender === 'w' ? 'b' : 'w';
      for (const fact of result.proof.escapes) {
        if (board.get(fact.square)?.color === defender) {
          assert.deepEqual(fact.attackers, []);
        } else {
          const simulation = new Chess(board.fen());
          simulation.remove(result.proof.king);
          simulation.remove(fact.square);
          simulation.put({ color: defender, type: 'k' }, fact.square);
          assert.ok(fact.attackers.length > 0, `${puzzle.id} ${move}: ${fact.square} must be controlled`);
          assert.deepEqual(fact.attackers, simulation.attackers(fact.square, attacker));
        }
      }
    }
  }
});

test("feedback distinguishes an escape, capture, block, non-check, and stalemate", () => {
  const escape = analyzeAttempt(lessons[1].fen, "Qh6+");
  assert.equal(escape.status, "check");
  assert.equal(escape.reply?.san, "Kg8");
  const capture = analyzeAttempt(lessons[5].fen, "Qg7+");
  assert.equal(capture.reply?.san, "Kxg7");
  const block = analyzeAttempt("7k/1r4pp/8/8/8/8/8/R5K1 w - - 0 1", "Ra8+");
  assert.equal(block.status, "check");
  assert.equal(block.reply?.san, "Rb8");
  assert.equal(analyzeAttempt(lessons[1].fen, "Qg4").status, "not-check");
  assert.equal(analyzeAttempt(lessons[1].fen, "Qf7").status, "stalemate");
});

test("illegal attempts explain rules, blockers, promotions, and king safety without changing the board", () => {
  const pass = analyzeAttempt(lessons[1].fen, "--");
  assert.equal(pass.status, "illegal");
  assert.equal(pass.afterFen, lessons[1].fen);
  assert.match(pass.message, /cannot pass/);
  for (const [input, message] of [
    [{ from: "a1", to: "a2" }, /no piece/],
    [{ from: "h8", to: "h7" }, /White's turn/],
    [{ from: "g6", to: "f6" }, /own king/],
    [{ from: "g6", to: "e7" }, /cannot move/],
  ] as const) {
    const result = analyzeAttempt(lessons[1].fen, input);
    assert.equal(result.status, "illegal");
    assert.equal(result.afterFen, lessons[1].fen);
    assert.match(result.message, message);
  }
  assert.match(analyzeAttempt(lessons[6].fen, { from: "h8", to: "h2" }).message, /blocked.*h3/);
  assert.match(analyzeAttempt("4r2k/8/8/8/8/8/4R3/4K3 w - - 0 1", { from: "e2", to: "d2" }).message, /leave your king.*check/);
  assert.match(analyzeAttempt("k7/2P5/1K6/8/8/8/8/8 w - - 0 1", { from: "c7", to: "c8" }).message, /must promote/);
});

test("all four promotion choices, en passant, castling, and discovered checks are analyzed", () => {
  const fen = "k7/2P5/1K6/8/8/8/8/8 w - - 0 1";
  for (const promotion of ["q", "r", "b", "n"]) {
    const result = analyzeAttempt(fen, { from: "c7", to: "c8", promotion });
    assert.notEqual(result.status, "illegal");
    assert.equal(result.status === "mate", promotion === 'q' || promotion === 'r');
    assert.ok(result.tags.includes(promotion === 'q' ? 'promotion' : 'underpromotion'));
  }
  const ep = analyzeAttempt("8/4N1B1/8/R3Pp1k/5K2/6B1/8/8 w - f6 0 2", "exf6#");
  assert.equal(ep.status, "mate");
  assert.ok(ep.tags.includes("en passant"));
  assert.ok(ep.tags.includes("capture"));
  assert.ok(ep.tags.includes("discovered check"));
  const castle = analyzeAttempt("5k2/8/8/8/8/8/4R1R1/4K2R w K - 0 1", "O-O#");
  assert.equal(castle.status, "mate");
  assert.ok(castle.tags.includes("castling"));
  assert.ok(!castle.tags.includes("discovered check"));
  assert.ok(analyzeAttempt(lessons[8].fen, "Bb6#").tags.includes("discovered check"));
});

test("the changed positions demonstrate the authored counterexamples", () => {
  for (const [index, move, reply] of [[1, "Qh6", "Kg8"], [3, "Re8", "Kh7"], [5, "Qg7", "Kxg7"]] as const) {
    const result = analyzeAttempt(lessons[index].fen, move);
    assert.equal(result.status, "check");
    assert.equal(result.reply?.san, reply);
  }
  assert.equal(analyzeAttempt(lessons[6].fen, { from: "h3", to: "f2" }).status, "mate");
  assert.equal(analyzeAttempt(lessons[7].fen, { from: "f3", to: "f2" }).status, "illegal");
});

test("en passant that exposes the king is rejected for king safety, not pawn geometry", () => {
  const fen = "k7/8/8/r4pPK/8/8/8/8 w - f6 0 2";
  const result = analyzeAttempt(fen, { from: "g5", to: "f6" });
  assert.equal(result.status, "illegal");
  assert.equal(result.afterFen, fen);
  assert.match(result.message, /king on h5 in check from the rook on a5/);
  assert.doesNotMatch(result.message, /cannot move.*that way/);
});

test("the second protection mate is supported by escape-square coverage, not a protected bishop", () => {
  const board = new Chess(lessons[5].fen);
  board.move("Bf6#");
  assert.ok(board.isCheckmate());
  assert.ok(board.attackers("g7", "w").includes("g4"));
  assert.ok(board.attackers("g8", "w").includes("g4"));
  assert.ok(board.attackers("h8", "w").includes("f6"));
  assert.deepEqual(board.get("h7"), { type: "p", color: "b" });
  assert.ok(!board.attackers("f6", "w").includes("g4"));
});
