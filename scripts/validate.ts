import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validatePuzzles } from "../src/validation";

function main(): void {
  const path = process.argv[2] ?? fileURLToPath(new URL("../data/puzzles.json", import.meta.url));
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`Unable to read puzzle data: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  const results = validatePuzzles(input);
  for (const result of results) {
    if (result.valid) {
      console.log(`PASS [${result.puzzleId}] Valid puzzle`);
    } else {
      console.error(`FAIL [${result.puzzleId}] Invalid puzzle:`);
      for (const message of result.messages) console.error(`   - ${message}`);
    }
  }
  const failures = results.filter((result) => !result.valid).length;
  if (failures > 0) {
    console.error(`\nValidation failed: ${failures} of ${results.length} records have issues.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} puzzles passed validation.`);
  }
}

main();
