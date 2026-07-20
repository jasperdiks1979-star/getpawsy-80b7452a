#!/usr/bin/env node
// Repository scan for direct Content API v2.1 references. Phase 1 marks each
// as "legacy-expected" or "unexpected".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["supabase/functions", "src", "docs", "scripts"];
const HOST = "shoppingcontent.googleapis.com";

const EXPECTED = new Set([
  "scripts/merchant-api-residual-scan.mjs",
  "supabase/functions/merchant-sync/index.ts",
  "supabase/functions/merchant-cleanup/index.ts",
  "supabase/functions/geip-sync-merchant/index.ts",
  "supabase/functions/cj-google-sync/index.ts",
  "supabase/functions/merchant-debug-sync/index.ts",
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { yield* walk(p); continue; }
    if (/\.(ts|tsx|js|mjs|md|json)$/.test(name)) yield p;
  }
}

const expected = [];
const unexpected = [];
for (const root of ROOTS) {
  try {
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      if (!src.includes(HOST)) continue;
      (EXPECTED.has(file.replace(/\\/g, "/")) ? expected : unexpected).push(file);
    }
  } catch { /* missing root */ }
}

console.log(JSON.stringify({ expected, unexpected, host: HOST, phase: 1 }, null, 2));
if (unexpected.length) process.exitCode = 1;