#!/usr/bin/env node
/**
 * Cloudflare Cache Audit Script
 * Tests origin headers + CF cache behavior for getpawsy.pet
 *
 * Usage: node tools/cf-cache-audit.js [--domain=https://getpawsy.pet]
 */

const DOMAIN = process.argv.find(a => a.startsWith('--domain='))?.split('=')[1] || 'https://getpawsy.pet';

const HEADERS_TO_CAPTURE = [
  'cf-cache-status', 'cache-control', 'etag', 'last-modified',
  'age', 'vary', 'set-cookie', 'content-type', 'cf-ray',
];

const URLS = [
  { path: '/', type: 'html', expect: 'MISS→HIT' },
  { path: '/collections/cat-trees-and-condos', type: 'html', expect: 'MISS→HIT' },
  { path: '/guides/best-cat-litter-box-2026', type: 'html', expect: 'MISS→HIT' },
];

async function detectAssetUrl() {
  try {
    const res = await fetch(`${DOMAIN}/`, { redirect: 'follow' });
    const html = await res.text();
    const match = html.match(/\/assets\/index-[a-zA-Z0-9]+\.js/);
    return match ? match[0] : null;
  } catch { return null; }
}

async function fetchHeaders(url) {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'Accept': 'text/html,application/xhtml+xml,*/*' },
  });
  // consume body
  await res.text();
  const captured = { status: res.status };
  for (const h of HEADERS_TO_CAPTURE) {
    captured[h] = res.headers.get(h) || '—';
  }
  return captured;
}

function printRow(label, h) {
  const cols = [
    String(h.status).padEnd(4),
    (h['cf-cache-status'] || '—').padEnd(10),
    (h['cache-control'] || '—').substring(0, 55).padEnd(56),
    h['set-cookie'] !== '—' ? '⚠ YES' : '✅ none',
    (h['vary'] || '—').padEnd(20),
    (h['cf-ray'] || '—').padEnd(22),
  ];
  console.log(`  ${label.padEnd(12)} │ ${cols.join(' │ ')}`);
}

async function main() {
  console.log(`\n🔍 CF Cache Audit — ${DOMAIN}\n`);

  // Auto-detect hashed JS asset
  const assetPath = await detectAssetUrl();
  if (assetPath) {
    URLS.push({ path: assetPath, type: 'asset', expect: 'HIT (or MISS→HIT)' });
  } else {
    console.log('⚠  Could not detect hashed JS asset from homepage HTML.\n');
  }

  const header = [
    'Request'.padEnd(12),
    'Code'.padEnd(4),
    'CF-Status'.padEnd(10),
    'Cache-Control'.padEnd(56),
    'Cookie'.padEnd(7),
    'Vary'.padEnd(20),
    'CF-Ray'.padEnd(22),
  ].join(' │ ');
  const sep = '─'.repeat(header.length + 4);

  console.log(`  ${header}`);
  console.log(`  ${sep}`);

  const results = [];

  for (const { path, type, expect } of URLS) {
    const url = `${DOMAIN}${path}`;
    try {
      const h1 = await fetchHeaders(url);
      printRow(`${type}:1st`, h1);

      // Small delay to allow CF to populate cache
      await new Promise(r => setTimeout(r, 500));

      const h2 = await fetchHeaders(url);
      printRow(`${type}:2nd`, h2);

      const hasCookie = h1['set-cookie'] !== '—' || h2['set-cookie'] !== '—';
      const gotHit = h2['cf-cache-status'] === 'HIT';
      const hasPublic = (h1['cache-control'] || '').includes('public');

      results.push({
        path,
        type,
        expect,
        first: h1['cf-cache-status'],
        second: h2['cf-cache-status'],
        cacheControl: h1['cache-control'],
        cookiePresent: hasCookie,
        pass: type === 'html'
          ? (hasPublic && !hasCookie)
          : (h1['cache-control'] || '').includes('immutable'),
      });

      console.log('');
    } catch (err) {
      console.log(`  ❌ ${path}: ${err.message}\n`);
      results.push({ path, type, expect, error: err.message });
    }
  }

  // Summary
  console.log('━'.repeat(60));
  console.log('SUMMARY');
  console.log('━'.repeat(60));
  for (const r of results) {
    if (r.error) {
      console.log(`  ❌ ${r.path} — Error: ${r.error}`);
      continue;
    }
    const icon = r.pass ? '✅' : '⚠ ';
    const cookie = r.cookiePresent ? '⚠ Set-Cookie present (likely __cf_bm from CF edge)' : 'No cookies';
    console.log(`  ${icon} ${r.path}`);
    console.log(`     CF-Cache: ${r.first} → ${r.second} (expected: ${r.expect})`);
    console.log(`     Cache-Control: ${r.cacheControl}`);
    console.log(`     Cookies: ${cookie}`);
  }

  console.log('\n📋 NOTE: If CF-Cache-Status is missing or always DYNAMIC:');
  console.log('   → Cloudflare needs a Cache Rule: "Cache Everything" for getpawsy.pet/*');
  console.log('   → Edge TTL: "Respect Origin Headers"');
  console.log('   → Bot Fight Mode may need to be OFF (injects __cf_bm cookie)\n');
}

main().catch(e => { console.error(e); process.exit(1); });
