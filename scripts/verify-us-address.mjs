#!/usr/bin/env node
/**
 * verify-us-address.mjs
 *
 * Build-time merchant-identity guard.
 *
 * GetPawsy is a trading name of Skidzo, a Dutch sole proprietorship registered in
 * the Netherlands (KvK 78156955, VAT ID NL003295015B69), based in Apeldoorn,
 * Netherlands, serving customers in the United States.
 *
 * Required signals (all must pass):
 *   1. JSON-LD `addressCountry` must be 'NL' (merchant address) or 'US'
 *      (shipping / service-area blocks).
 *   2. JSON-LD `addressLocality`, when present, must be 'Apeldoorn'.
 *   3. No false US-entity claims (GetPawsy LLC, "New York, NY" as the business
 *      address, "US-based company") may appear in public surfaces.
 *   4. No private data (owner name, street address, date of birth, internal
 *      omzetbelastingnummer) may ever be published.
 *
 * Usage:
 *   node scripts/verify-us-address.mjs            # source-only scan
 *   node scripts/verify-us-address.mjs --dist     # also scan built dist/
 *   node scripts/verify-us-address.mjs --warn     # report but don't fail
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const ROOT = process.cwd();
const ARGS = new Set(process.argv.slice(2));
const SCAN_DIST = ARGS.has('--dist');
const WARN_ONLY = ARGS.has('--warn');

// ---- Forbidden tokens (case-insensitive, word-boundary where possible) -----
// Tokens that should NEVER appear in public/contact/JSON-LD output.
const FORBIDDEN_PATTERNS = [
  // --- False US-entity claims (the merchant is Dutch) ---
  { re: /GetPawsy\s+LLC/i, label: 'GetPawsy LLC (false US entity)' },
  { re: /\bNew York,?\s*(NY|New York)\b/i, label: 'New York business address (false)' },
  { re: /US[-\s]based\s+(company|entity|business|retailer|merchant)/i, label: 'US-based entity claim (false)' },
  { re: /headquartered\s+in\s+New York/i, label: 'New York HQ claim (false)' },
  // --- Private data that must never be published ---
  { re: /omzetbelastingnummer/i, label: 'internal omzetbelastingnummer' },
  { re: /101001964B02/i, label: 'internal tax number' },
];


// Hard-required JSON-LD fields
const JSONLD_ADDRESS_RE = /addressCountry\s*[:=]\s*['"]([A-Z]{2})['"]/g;
const JSONLD_LOCALITY_RE = /addressLocality\s*[:=]\s*['"]([^'"]+)['"]/g;

const ALLOWED_COUNTRIES = new Set(['NL', 'US']);
const ALLOWED_LOCALITY = 'Apeldoorn';

// ---- Files to scan -----------------------------------------------------------
const SOURCE_TARGETS = [
  'src/components/seo',
  'src/components/Footer.tsx',
  'src/components/layout',
  'src/pages/Contact.tsx',
  'src/pages/About.tsx',
  'src/pages/Shipping.tsx',
  'src/pages/Returns.tsx',
  'src/pages/Privacy.tsx',
  'src/pages/Terms.tsx',
  'index.html',
];

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.html', '.json']);
const DIST_EXT = new Set(['.html', '.json', '.xml']);

function walk(target, exts, out = []) {
  const abs = join(ROOT, target);
  if (!existsSync(abs)) return out;
  const stat = statSync(abs);
  if (stat.isFile()) {
    if (exts.has(extname(abs))) out.push(abs);
    return out;
  }
  for (const entry of readdirSync(abs)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    walk(join(target, entry), exts, out);
  }
  return out;
}

function collectSourceFiles() {
  const files = [];
  for (const t of SOURCE_TARGETS) walk(t, SOURCE_EXT, files);
  return files;
}

function collectDistFiles() {
  const files = [];
  walk('dist', DIST_EXT, files);
  return files;
}

// ---- Scanning ----------------------------------------------------------------
const violations = [];

function recordViolation(file, line, col, message, snippet) {
  violations.push({
    file: relative(ROOT, file),
    line,
    col,
    message,
    snippet: snippet?.slice(0, 200),
  });
}

function lineOf(content, index) {
  const upTo = content.slice(0, index);
  const line = upTo.split('\n').length;
  const lastNl = upTo.lastIndexOf('\n');
  const col = lastNl === -1 ? index + 1 : index - lastNl;
  return { line, col };
}

function scanFile(file) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return;
  }

  // 1) JSON-LD addressCountry must be US
  for (const match of content.matchAll(JSONLD_ADDRESS_RE)) {
    const value = match[1];
    if (!ALLOWED_COUNTRIES.has(value)) {
      const { line, col } = lineOf(content, match.index ?? 0);
      recordViolation(
        file,
        line,
        col,
        `JSON-LD addressCountry='${value}' (expected 'NL' or 'US')`,
        match[0],
      );
    }
  }

  // 2) JSON-LD addressLocality must be New York (when present)
  for (const match of content.matchAll(JSONLD_LOCALITY_RE)) {
    const value = match[1];
    if (value !== ALLOWED_LOCALITY) {
      const { line, col } = lineOf(content, match.index ?? 0);
      recordViolation(
        file,
        line,
        col,
        `JSON-LD addressLocality='${value}' (expected '${ALLOWED_LOCALITY}')`,
        match[0],
      );
    }
  }

  // 3) Forbidden tokens (false identity + private data)
  for (const { re, label } of FORBIDDEN_PATTERNS) {
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const match of content.matchAll(globalRe)) {
      const idx = match.index ?? 0;
      const { line, col } = lineOf(content, idx);
      // Pull the surrounding line for context
      const lineStart = content.lastIndexOf('\n', idx) + 1;
      const lineEnd = content.indexOf('\n', idx);
      const lineText = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
      recordViolation(file, line, col, `Forbidden token '${label}'`, lineText);
    }
  }
}

// ---- Run ---------------------------------------------------------------------
const sourceFiles = collectSourceFiles();
const distFiles = SCAN_DIST ? collectDistFiles() : [];
const allFiles = [...sourceFiles, ...distFiles];

console.log(
  `🔎 verify-merchant-identity: scanning ${sourceFiles.length} source file(s)` +
    (SCAN_DIST ? ` + ${distFiles.length} dist file(s)` : ''),
);

for (const f of allFiles) scanFile(f);

if (violations.length === 0) {
  console.log('✅ Merchant identity consistent: Skidzo (trading as GetPawsy), Apeldoorn, Netherlands. No false US-entity or private-data strings detected.');
  process.exit(0);
}

console.error(`\n❌ verify-merchant-identity: ${violations.length} violation(s) detected:\n`);
for (const v of violations) {
  console.error(`  • ${v.file}:${v.line}:${v.col}  ${v.message}`);
  if (v.snippet) console.error(`      → ${v.snippet}`);
}
console.error('');

if (WARN_ONLY) {
  console.warn('⚠️  --warn flag set: not failing the build. Fix these before publishing.');
  process.exit(0);
}

process.exit(1);