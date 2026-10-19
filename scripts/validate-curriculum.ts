import { validateCurriculum } from "../src/curriculum";

const results = validateCurriculum();
for (const result of results) {
  console.log(`${result.valid ? "PASS" : "FAIL"} [${result.puzzleId}]${result.messages.length ? ` ${result.messages.join("; ")}` : " Teaching puzzle and pair verified"}`);
}
if (results.some((result) => !result.valid)) process.exitCode = 1;
