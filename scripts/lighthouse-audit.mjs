#!/usr/bin/env node

/**
 * GetPawsy — Lighthouse Audit Runner
 * 
 * Runs Lighthouse against production URLs and outputs HTML+JSON reports.
 * 
 * Usage:
 *   node scripts/lighthouse-audit.mjs mobile
 *   node scripts/lighthouse-audit.mjs desktop
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';

const mode = process.argv[2] || 'mobile';
const isDesktop = mode === 'desktop';

const URLS = [
  'https://getpawsy.pet/',
  'https://getpawsy.pet/products?category=small-pets',
  'https://getpawsy.pet/go',
];

const AUDIT_DIR = './audits';
if (!existsSync(AUDIT_DIR)) {
  mkdirSync(AUDIT_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().slice(0, 10);
const formFactor = isDesktop ? 'desktop' : 'mobile';
const throttling = isDesktop
  ? '--throttling-method=simulate --screenEmulation.disabled'
  : '--preset=perf --emulated-form-factor=mobile';

console.log(`\n🔍 Running Lighthouse (${formFactor}) audits...\n`);

for (const url of URLS) {
  const slug = url
    .replace('https://getpawsy.pet', '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'home';

  const outPath = `${AUDIT_DIR}/${formFactor}-${slug}-${timestamp}`;

  const cmd = [
    'npx lighthouse',
    `"${url}"`,
    '--quiet',
    '--output=html --output=json',
    `--output-path="${outPath}"`,
    '--chrome-flags="--headless --no-sandbox"',
    '--only-categories=performance,seo,best-practices,accessibility',
    isDesktop ? '--preset=desktop' : '',
    !isDesktop ? '--emulated-form-factor=mobile' : '',
  ].filter(Boolean).join(' ');

  console.log(`  → ${url}`);
  console.log(`    Output: ${outPath}.report.html\n`);

  try {
    execSync(cmd, { stdio: 'inherit', timeout: 120_000 });
  } catch (e) {
    console.error(`  ⚠️  Lighthouse failed for ${url}:`, e.message);
  }
}

console.log(`\n✅ Audit reports saved to ${AUDIT_DIR}/`);
console.log('   Open .report.html files in a browser to view results.\n');
