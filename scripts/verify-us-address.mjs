#!/usr/bin/env node
/**
 * verify-us-address.mjs
 *
 * Build-time guard that fails the build if any contact information,
 * JSON-LD address block, or rendered HTML still references EU/NL addresses.
 *
 * Required signals (all must pass):
 *   1. JSON-LD `addressCountry` values must be 'US' (no 'NL', 'BE', 'DE', 'GB', 'FR', etc.)
 *   2. JSON-LD `addressLocality` (when present) must be 'New York'
 *   3. JSON-LD `addressRegion` (when present) must be 'NY'
 *   4. No forbidden city/country/postcode tokens may appear in:
 *        - src/components/seo/**
 *        - src/components/footer/** & layout files
 *        - src/pages/Contact.tsx, About.tsx, Shipping.tsx, Returns.tsx,
 *          Privacy.tsx, Terms.tsx
 *        - dist/**\/*.html  (post-build)
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
  { re: /\bNetherlands\b/i, label: 'Netherlands' },
  { re: /\bNederland\b/i, label: 'Nederland' },
  { re: /\bAmsterdam\b/i, label: 'Amsterdam' },
  { re: /\bRotterdam\b/i, label: 'Rotterdam' },
  { re: /\bUtrecht\b/i, label: 'Utrecht' },
  { re: /\bDen Haag\b/i, label: 'Den Haag' },
  { re: /\bThe Hague\b/i, label: 'The Hague' },
  { re: /\bApeldoorn\b/i, label: 'Apeldoorn' },
  { re: /\bEindhoven\b/i, label: 'Eindhoven' },
  { re: /\bGroningen\b/i, label: 'Groningen' },
  { re: /\bPostbus\b/i, label: 'Postbus' },
  { re: /\bKvK[\s:#-]*\d/i, label: 'KvK number' },
  { re: /\bBTW[\s:#-]*NL/i, label: 'BTW NL VAT' },
  { re: /\bVAT[\s:#-]*NL\d/i, label: 'VAT NL number' },
  // Dutch postal code pattern: 4 digits + space + 2 UPPERCASE letters.
  // Use a strict non-CSS context: must not be preceded by digits-of-pixel (e.g. 1280px),
  // and must not be followed by typical CSS unit/word characters. Require a real word break
  // and an uppercase 2-letter region code (NL postcodes are always uppercase).
  {
    re: /(?<![0-9a-zA-Z])[1-9]\d{3}\s[A-Z]{2}(?![a-zA-Z0-9])/,
    label: 'NL postal code (NNNN AA)',
  },
  // EU country codes inside postal addresses (we look for these only in JSON-LD context below)
];

// Hard-required JSON-LD fields
const JSONLD_ADDRESS_RE = /addressCountry\s*[:=]\s*['"]([A-Z]{2})['"]/g;
const JSONLD_LOCALITY_RE = /addressLocality\s*[:=]\s*['"]([^'"]+)['"]/g;
const JSONLD_REGION_RE = /addressRegion\s*[:=]\s*['"]([^'"]+)['"]/g;

const ALLOWED_COUNTRY = 'US';
const ALLOWED_LOCALITY = 'New York';
const ALLOWED_REGION = 'NY';

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
    if (value !== ALLOWED_COUNTRY) {
      const { line, col } = lineOf(content, match.index ?? 0);
      recordViolation(
        file,
        line,
        col,
        `JSON-LD addressCountry='${value}' (expected '${ALLOWED_COUNTRY}')`,
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

  // 3) JSON-LD addressRegion must be NY (when present)
  for (const match of content.matchAll(JSONLD_REGION_RE)) {
    const value = match[1];
    if (value !== ALLOWED_REGION) {
      const { line, col } = lineOf(content, match.index ?? 0);
      recordViolation(
        file,
        line,
        col,
        `JSON-LD addressRegion='${value}' (expected '${ALLOWED_REGION}')`,
        match[0],
      );
    }
  }

  // 4) Forbidden EU/NL tokens
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
  `🔎 verify-us-address: scanning ${sourceFiles.length} source file(s)` +
    (SCAN_DIST ? ` + ${distFiles.length} dist file(s)` : ''),
);

for (const f of allFiles) scanFile(f);

if (violations.length === 0) {
  console.log('✅ All contact/JSON-LD address fields point to "New York, NY" (US). No EU/NL strings detected.');
  process.exit(0);
}

console.error(`\n❌ verify-us-address: ${violations.length} violation(s) detected:\n`);
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