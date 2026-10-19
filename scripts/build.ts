import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
await build({ entryPoints: ["web/app.ts"], bundle: true, format: "esm", target: "es2022", outfile: "dist/app.js", minify: true, sourcemap: true });
copyFileSync("web/index.html", "dist/index.html");
if (existsSync("research/artifacts/report.html")) {
  mkdirSync("dist/research", { recursive: true });
  copyFileSync("research/artifacts/report.html", "dist/research/index.html");
  for (const file of ["metrics.png", "results.json", "REPORT.md"]) copyFileSync(`research/artifacts/${file}`, `dist/research/${file}`);
}
console.log("Built the teaching app in dist/");
