#!/usr/bin/env node
// Assemble the published folder: the page, the rules it imports (lib.mjs) and its assets, the
// latest status.json (written by probe.mjs), the history, and the incidents read from
// incidents/*.md.
//
//   node scripts/build.mjs --root . --history data/history.json --out site
//
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyHistory, parseIncident, sortIncidents } from "./lib.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const root = option("--root", ".");
const historyPath = option("--history", "data/history.json");
const outDir = option("--out", "site");

mkdirSync(outDir, { recursive: true });
cpSync(join(root, "index.html"), join(outDir, "index.html"));
// The page's script imports the same rules the checks use, so the two cannot disagree.
cpSync(join(root, "scripts", "lib.mjs"), join(outDir, "lib.mjs"));
if (existsSync(join(root, "assets"))) cpSync(join(root, "assets"), join(outDir, "assets"), { recursive: true });
// GitHub Pages runs Jekyll unless told not to, and Jekyll drops files whose names start with an underscore.
writeFileSync(join(outDir, ".nojekyll"), "");

const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, "utf8")) : emptyHistory();
writeFileSync(join(outDir, "history.json"), `${JSON.stringify(history)}\n`);

if (!existsSync(join(outDir, "status.json"))) {
  writeFileSync(join(outDir, "status.json"), `${JSON.stringify({ generatedAt: null, overall: "unknown", components: [] })}\n`);
}

const incidentsDir = join(root, "incidents");
const incidents = [];
const problems = [];
if (existsSync(incidentsDir)) {
  for (const file of readdirSync(incidentsDir).sort()) {
    if (!file.endsWith(".md") || file.startsWith("_") || file.toLowerCase() === "readme.md") continue;
    const slug = file.replace(/\.md$/, "");
    const parsed = parseIncident(slug, readFileSync(join(incidentsDir, file), "utf8"));
    if (parsed.incident) incidents.push(parsed.incident);
    else problems.push(`${file}: ${parsed.problems.join("; ")}`);
  }
}
writeFileSync(join(outDir, "incidents.json"), `${JSON.stringify(sortIncidents(incidents), null, 2)}\n`);

for (const p of problems) console.error(`build: incident skipped, ${p}`);
console.log(`build: ${incidents.length} incident(s), ${problems.length} skipped, written to ${outDir}/`);
if (problems.length) process.exitCode = 1;
