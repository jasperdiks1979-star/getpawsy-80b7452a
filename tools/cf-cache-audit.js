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
  'age', 'vary', 'set-cookie', 'content-type', 'cf-ray', 'x-cache-debug',
];

const URLS = [
  { path: '/', type: 'html', expect: 'MISS→HIT' },
  { path: '/collections/cat-trees-and-condos', type: 'html', expect: 'MISS→HIT' },
  { path: '/guides/best-cat-litter-box-2026', type: 'html', expect: 'MISS→HIT' },
  { path: '/sitemap.xml', type: 'seo', expect: 'MISS→HIT' },
  { path: '/robots.txt', type: 'seo', expect: 'MISS→HIT' },
  { path: '/merchant-feed.xml', type: 'seo', expect: 'MISS→HIT' },
];

async function detectAssetUrl() {
  try {
    const res = await fetch(`${DOMAIN}/`, { redirect: 'follow' });
    const html = await res.text();
    const match = html.match(/\/assets\/index-[a-zA-Z0-9]+\.js/);
    return match ? match[0] : null;
  } catch { return null; }
}

async function checkRedirect(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const location = res.headers.get('location') || '—';
    return { status: res.status, location };
  } catch (e) { return { status: 'ERR', location: e.message }; }
}

async function fetchHeaders(url) {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'Accept': 'text/html,application/xhtml+xml,*/*' },
  });
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
    (h['x-cache-debug'] || '—').padEnd(16),
    (h['vary'] || '—').padEnd(20),
    (h['cf-ray'] || '—').padEnd(22),
  ];
  console.log(`  ${label.padEnd(12)} │ ${cols.join(' │ ')}`);
}

async function main() {
  console.log(`\n🔍 CF Cache Audit — ${DOMAIN}\n`);

  // --- Redirect checks ---
  console.log('━'.repeat(60));
  console.log('REDIRECT CHECKS');
  console.log('━'.repeat(60));
  const redirects = [
    { url: `https://www.getpawsy.pet/`, expect: '301 → apex' },
    { url: `https://getpawsy.pet/collections/cat-trees-and-condos/`, expect: '301 strip slash' },
  ];
  for (const r of redirects) {
    const result = await checkRedirect(r.url);
    const icon = result.status === 301 ? '✅' : '⚠ ';
    console.log(`  ${icon} ${r.url} → ${result.status} ${result.location} (expected: ${r.expect})`);
  }
  console.log('');

  // --- Asset detection ---
  const assetPath = await detectAssetUrl();
  if (assetPath) {
    URLS.push({ path: assetPath, type: 'asset', expect: 'HIT (or MISS→HIT)' });
  } else {
    console.log('⚠  Could not detect hashed JS asset from homepage HTML.\n');
  }

  // --- Header table ---
  const header = [
    'Request'.padEnd(12),
    'Code'.padEnd(4),
    'CF-Status'.padEnd(10),
    'Cache-Control'.padEnd(56),
    'Cookie'.padEnd(7),
    'X-Cache-Debug'.padEnd(16),
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

      await new Promise(r => setTimeout(r, 500));

      const h2 = await fetchHeaders(url);
      printRow(`${type}:2nd`, h2);

      const hasCookie = h1['set-cookie'] !== '—' || h2['set-cookie'] !== '—';
      const hasPublic = (h1['cache-control'] || '').includes('public');
      const hasDebug = h1['x-cache-debug'] !== '—';

      results.push({
        path, type, expect,
        first: h1['cf-cache-status'],
        second: h2['cf-cache-status'],
        cacheControl: h1['cache-control'],
        debugHeader: h1['x-cache-debug'],
        cookiePresent: hasCookie,
        pass: hasPublic && !hasCookie && hasDebug,
      });

      console.log('');
    } catch (err) {
      console.log(`  ❌ ${path}: ${err.message}\n`);
      results.push({ path, type, expect, error: err.message });
    }
  }

  // --- Summary ---
  console.log('━'.repeat(60));
  console.log('SUMMARY');
  console.log('━'.repeat(60));
  for (const r of results) {
    if (r.error) {
      console.log(`  ❌ ${r.path} — Error: ${r.error}`);
      continue;
    }
    const icon = r.pass ? '✅' : '⚠ ';
    const cookie = r.cookiePresent ? '⚠ Set-Cookie present' : 'No cookies';
    console.log(`  ${icon} ${r.path}`);
    console.log(`     CF-Cache: ${r.first} → ${r.second} (expected: ${r.expect})`);
    console.log(`     Cache-Control: ${r.cacheControl}`);
    console.log(`     X-Cache-Debug: ${r.debugHeader}`);
    console.log(`     Cookies: ${cookie}`);
  }

  console.log('\n📋 If CF-Cache-Status stays DYNAMIC or is missing:');
  console.log('   → Cloudflare needs a Cache Rule for getpawsy.pet (see docs/cloudflare-caching.md)');
  console.log('   → Bot Fight Mode may need to be OFF\n');
}

main().catch(e => { console.error(e); process.exit(1); });
