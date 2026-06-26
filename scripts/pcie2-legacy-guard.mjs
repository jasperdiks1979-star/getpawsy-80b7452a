#!/usr/bin/env node
// PCIE2 Legacy Guard — fails the build if any legacy Pinterest publisher
// re-introduces a POST/PATCH to /v5/pins outside the sole publisher.
// Run automatically pre-deploy (CI) and locally via `node scripts/pcie2-legacy-guard.mjs`.
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { execSync } from "node:child_process";

const ALLOWED = new Set([
  "supabase/functions/pcie2-publisher/index.ts",
]);

// All Pinterest API write endpoints (create + update + republish).
const FORBIDDEN_PATTERNS = [
  /fetch\(\s*[`'"][^`'"]*\/v5\/pins[^`'"]*[`'"][\s\S]*?method:\s*['"]POST['"]/m,
  /fetch\(\s*[`'"][^`'"]*\/v5\/pins[^`'"]*[`'"][\s\S]*?method:\s*['"]PATCH['"]/m,
  // Video pin uploads use /v5/media — same blast radius as /v5/pins for new content.
  /fetch\(\s*[`'"][^`'"]*\/v5\/media[^`'"]*[`'"][\s\S]*?method:\s*['"]POST['"]/m,
];

let files;
try {
  files = execSync("git ls-files supabase/functions", { encoding: "utf8" })
    .split("\n").filter(Boolean).filter(f => f.endsWith(".ts"));
} catch {
  files = [];
}

const violations = [];
for (const f of files) {
  if (ALLOWED.has(f)) continue;
  let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(src)) { violations.push({ file: f, pattern: re.toString() }); break; }
  }
}

if (violations.length) {
  console.error("\n❌ PCIE2 Legacy Guard FAILED. The following files attempt to POST/PATCH /v5/pins outside the sole publisher:");
  for (const v of violations) console.error("  -", v.file);
  console.error("\nOnly supabase/functions/pcie2-publisher/index.ts may publish to Pinterest. Move the call there or remove it.");
  process.exit(1);
}
console.log(`✅ PCIE2 Legacy Guard passed. ${files.length} edge function files scanned. Sole publisher: pcie2-publisher.`);
