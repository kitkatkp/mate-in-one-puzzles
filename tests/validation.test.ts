import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Chess } from "chess.js";
import puzzles from "../data/puzzles.json";
import { getLegalMateInOneMoves, validatePuzzles } from "../src/validation";

const sample = puzzles[0];
function rejects(record: unknown, message: RegExp): void {
  const [result] = validatePuzzles([record]);
  assert.equal(result.valid, false);
  assert.match(result.messages.join("\n"), message);
}

test("all curated examples pass, including Black to move", () => {
  assert.ok(validatePuzzles(puzzles).every((result) => result.valid));
  assert.ok(puzzles.some((puzzle) => puzzle.sideToMove === "b"));
});

test("rejects the original sample: the opponent is already in check", () => {
  rejects({ ...sample, fen: "6k1/7Q/6K1/8/8/8/8/8 w - - 0 1" }, /side not to move is already in check/);
});

test("allows the side to move to escape check with a mating capture", () => {
  const record = { ...sample, fen: "7k/6p1/5KQ1/8/8/8/8/8 w - - 0 1", solutions: ["Qxg7#"] };
  assert.equal(validatePuzzles([record])[0].valid, true);
});

test("rejects adjacent kings and malformed FENs", () => {
  rejects({ ...sample, fen: "8/8/8/8/8/8/4k3/4K3 w - - 0 1" }, /already in check/);
  for (const fen of ["invalid", "8/8/8/8/8/8/8/8 w - - 0 1", "7k/8/5KQ1/8/8/8/8/P7 w - - 0 1"]) {
    rejects({ ...sample, fen }, /Invalid FEN/);
  }
});

test("malformed records produce diagnostics without crashing", () => {
  for (const record of [null, [], "puzzle", {}, { ...sample, id: " " },
    { ...sample, fen: 5 }, { ...sample, sideToMove: "white" },
    { ...sample, solutions: null }, { ...sample, solutions: [] },
    { ...sample, solutions: [5] }, { ...sample, solutions: [" "] }]) {
    assert.equal(validatePuzzles([record])[0].valid, false);
  }
  for (const input of [null, {}, [], "puzzles"]) assert.equal(validatePuzzles(input)[0].valid, false);
  const results = validatePuzzles([null, sample]);
  assert.equal(results[0].valid, false);
  assert.equal(results[1].valid, true);
});

test("rejects duplicate IDs, including surrounding whitespace", () => {
  const results = validatePuzzles([sample, { ...puzzles[1], id: ` ${sample.id} ` }]);
  assert.match(results[1].messages.join("\n"), /Duplicate puzzle ID/);
});

test("rejects duplicate positions even with changed clocks and spacing", () => {
  const results = validatePuzzles([sample, { ...sample, id: "other", fen: "7k/8/5KQ1/8/8/8/8/8   w - - 12 30" }]);
  assert.match(results[1].messages.join("\n"), /Duplicate position/);
});

test("rejects wrong turns, non-mating solutions, and duplicate solutions", () => {
  rejects({ ...sample, sideToMove: "b" }, /sideToMove/);
  rejects({ ...sample, solutions: ["Qg7"] }, /not all correct/);
  rejects({ ...sample, solutions: ["g6-g7"] }, /not all correct/);
  rejects({ ...sample, solutions: ["Qg7#", " Qg7# "] }, /Duplicate saved solutions/);
  rejects({ ...sample, fen: new Chess().fen() }, /No legal mate-in-one/);
});

test("requires every mating promotion, including rook underpromotion", () => {
  const record = { ...sample, fen: "k7/2P5/1K6/8/8/8/8/8 w - - 0 1", solutions: ["c8=Q#", "c8=R#"] };
  assert.equal(validatePuzzles([record])[0].valid, true);
  rejects({ ...record, solutions: ["c8=Q#"] }, /Missing correct mate-in-one moves: c8=R#/);
});

test("mate enumeration preserves board and history", () => {
  const chess = new Chess(sample.fen);
  assert.deepEqual(getLegalMateInOneMoves(chess), ["Qg7#"]);
  assert.equal(chess.fen(), sample.fen);
  assert.deepEqual(chess.history(), []);
});

test("accepts en passant mate and preserves meaningful en passant rights", () => {
  const record = { ...sample, fen: "8/4N1B1/8/R3Pp1k/5K2/6B1/8/8 w - f6 0 2", solutions: ["exf6#"] };
  assert.equal(validatePuzzles([record])[0].valid, true);
  const withoutRights = { ...record, id: "no-ep", fen: record.fen.replace("f6", "-") };
  const results = validatePuzzles([record, withoutRights]);
  assert.ok(!results[1].messages.some((message) => message.includes("Duplicate position")));
  assert.ok(results[1].messages.some((message) => message.includes("No legal mate-in-one")));
});

test("accepts castling mate and preserves meaningful castling rights", () => {
  const record = { ...sample, fen: "5k2/8/8/8/8/8/4R1R1/4K2R w K - 0 1", solutions: ["Rf1#", "O-O#"] };
  const withoutRights = { ...record, id: "no-castling", fen: record.fen.replace("w K", "w -"), solutions: ["Rf1#"] };
  assert.ok(validatePuzzles([record, withoutRights]).every((result) => result.valid));
});

test("rejects impossible material, castling, en passant, and fractional clocks", () => {
  rejects({ ...sample, fen: "7k/pppppppp/p7/8/8/5KQ1/8/8 w - - 0 1" }, /Illegal material count/);
  rejects({ ...sample, fen: "7k/pppppppp/1q6/8/8/5KQ1/8/q7 w - - 0 1" }, /not enough missing pawns/);
  rejects({ ...sample, fen: sample.fen.replace("w - -", "w K -") }, /Invalid castling right/);
  rejects({ ...sample, fen: sample.fen.replace("w - -", "w - e6") }, /Invalid en passant state/);
  rejects({ ...sample, fen: sample.fen.replace("0 1", "0.5 1") }, /move counters/);
});

test("CLI uses repository data from another working directory and reports file errors", () => {
  const directory = mkdtempSync(join(tmpdir(), "mate-in-one-"));
  const script = fileURLToPath(new URL("../scripts/validate.ts", import.meta.url));
  const tsx = import.meta.resolve("tsx");
  const run = (...args: string[]) => spawnSync(process.execPath, ["--import", tsx, script, ...args], {
    cwd: directory, encoding: "utf8", timeout: 20_000,
  });
  try {
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /All 3 puzzles passed/);
    const badFile = join(directory, "bad.json");
    writeFileSync(badFile, "not json");
    const invalidJson = run(badFile);
    assert.equal(invalidJson.status, 1);
    assert.match(invalidJson.stderr, /Unable to read puzzle data/);
    assert.equal(run(join(directory, "missing.json")).status, 1);
    writeFileSync(badFile, JSON.stringify([{ ...sample, solutions: ["Qg7"] }]));
    const invalidPuzzle = run(badFile);
    assert.equal(invalidPuzzle.status, 1);
    assert.match(invalidPuzzle.stderr, /not all correct/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
