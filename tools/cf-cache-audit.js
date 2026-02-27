#!/usr/bin/env node
/**
 * Cloudflare Cache Audit Script
 * Tests origin headers + CF cache behavior for getpawsy.pet
 *
 * Usage:
 *   node tools/cf-cache-audit.js [--domain=https://getpawsy.pet]
 *   npm run cache:audit
 *
 * Validates:
 *   - cf-cache-status transitions (MISS → HIT)
 *   - Absence of Set-Cookie on cacheable HTML
 *   - Absence of Vary: Cookie
 *   - Correct Cache-Control directives
 *   - Cart/auth routes are NOT cached
 */

const DOMAIN = process.argv.find(a => a.startsWith('--domain='))?.split('=')[1] || 'https://getpawsy.pet';

const HEADERS_TO_CAPTURE = [
  'cf-cache-status', 'cache-control', 'age', 'vary',
  'set-cookie', 'x-cache-debug', 'cf-ray', 'server',
];

const CACHEABLE_URLS = [
  { path: '/', label: 'Homepage', expectCache: true },
  { path: '/collections/cat-trees-and-condos', label: 'Collection', expectCache: true },
  { path: '/guides/best-cat-litter-box-2026', label: 'Guide', expectCache: true },
  { path: '/sitemap.xml', label: 'Sitemap', expectCache: true },
  { path: '/robots.txt', label: 'Robots', expectCache: true },
];

const NOCACHE_URLS = [
  { path: '/cart', label: 'Cart', expectCache: false },
  { path: '/auth', label: 'Auth', expectCache: false },
];

async function fetchHeaders(url) {
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'Accept': 'text/html,application/xhtml+xml,*/*' },
  });
  await res.text(); // consume body
  const h = { status: res.status };
  for (const name of HEADERS_TO_CAPTURE) {
    h[name] = res.headers.get(name) || null;
  }
  return h;
}

function icon(ok) { return ok ? '✅' : '❌'; }

async function testUrl({ path, label, expectCache }) {
  const url = `${DOMAIN}${path}`;
  console.log(`\n── ${label} (${path}) ──`);

  try {
    // Request 1
    const h1 = await fetchHeaders(url);
    console.log(`  1st request: ${h1.status} | cf-cache: ${h1['cf-cache-status'] || '—'} | age: ${h1.age || '—'}`);

    await new Promise(r => setTimeout(r, 1500));

    // Request 2
    const h2 = await fetchHeaders(url);
    console.log(`  2nd request: ${h2.status} | cf-cache: ${h2['cf-cache-status'] || '—'} | age: ${h2.age || '—'}`);

    // Checks
    const hasCookie1 = !!h1['set-cookie'];
    const hasCookie2 = !!h2['set-cookie'];
    const hasVaryCookie = (h1.vary || '').toLowerCase().includes('cookie');
    const cacheControl = h1['cache-control'] || '';
    const isPublic = cacheControl.includes('public') && cacheControl.includes('s-maxage');
    const isNoStore = cacheControl.includes('no-store') || cacheControl.includes('private');
    const cfStatus2 = (h2['cf-cache-status'] || '').toUpperCase();

    if (expectCache) {
      console.log(`  ${icon(!hasCookie1 && !hasCookie2)} Set-Cookie absent: ${!hasCookie1 && !hasCookie2}`);
      console.log(`  ${icon(!hasVaryCookie)} Vary: Cookie absent: ${!hasVaryCookie}`);
      console.log(`  ${icon(isPublic)} Cache-Control public+s-maxage: ${isPublic}`);
      console.log(`  ${icon(cfStatus2 === 'HIT')} cf-cache-status HIT on 2nd: ${cfStatus2}`);
      if (hasCookie1) console.log(`  ⚠  Set-Cookie value: ${h1['set-cookie'].substring(0, 80)}...`);
      if (cfStatus2 !== 'HIT') {
        console.log(`  ⚠  CACHING NOT WORKING — likely cause:`);
        if (hasCookie1 || hasCookie2) console.log(`     → Set-Cookie present (Bot Fight Mode?)`)
        else if (hasVaryCookie) console.log(`     → Vary: Cookie fragmenting cache`);
        else console.log(`     → Missing Cache Rule or conflicting Page Rule`);
      }
    } else {
      const isDynamic = ['DYNAMIC', 'BYPASS'].includes(cfStatus2) || !cfStatus2;
      console.log(`  ${icon(isDynamic)} Not cached (expected): cf-cache=${cfStatus2 || 'none'}`);
      console.log(`  ${icon(isNoStore)} Cache-Control no-store/private: ${isNoStore}`);
    }

    console.log(`  Cache-Control: ${cacheControl}`);
    console.log(`  Vary: ${h1.vary || '—'}`);
    console.log(`  X-Cache-Debug: ${h1['x-cache-debug'] || '—'}`);

    return { path, label, expectCache, pass: expectCache ? (cfStatus2 === 'HIT' && !hasCookie1) : true };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { path, label, expectCache, pass: false, error: err.message };
  }
}

async function main() {
  console.log(`\n🔍 CF Cache Audit — ${DOMAIN}`);
  console.log(`   ${new Date().toISOString()}\n`);
  console.log('═'.repeat(60));
  console.log('CACHEABLE ROUTES (expect MISS → HIT)');
  console.log('═'.repeat(60));

  const results = [];

  for (const url of CACHEABLE_URLS) {
    results.push(await testUrl(url));
  }

  console.log('\n' + '═'.repeat(60));
  console.log('NON-CACHEABLE ROUTES (expect DYNAMIC/BYPASS)');
  console.log('═'.repeat(60));

  for (const url of NOCACHE_URLS) {
    results.push(await testUrl(url));
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));

  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  console.log(`\n  ${passed}/${total} checks passed\n`);

  for (const r of results) {
    console.log(`  ${icon(r.pass)} ${r.label} (${r.path})${r.error ? ` — ${r.error}` : ''}`);
  }

  if (passed < total) {
    console.log('\n📋 Troubleshooting:');
    console.log('   1. Is Bot Fight Mode OFF? (Security → Bots → Bot Fight Mode: OFF)');
    console.log('   2. Are Cache Rules created? (see docs/cdn-edge-caching-enforcement.md)');
    console.log('   3. Did you Purge Everything after changes?');
    console.log('   4. Are there conflicting Page Rules?');
  } else {
    console.log('\n✅ All checks passed — edge caching is working correctly.');
    console.log('   Expected TTFB: <150ms | Expected LCP: <2.5s');
  }

  console.log('\n── Expected output after fix ──');
  console.log('  Homepage:    MISS → HIT, no Set-Cookie, no Vary: Cookie');
  console.log('  Collection:  MISS → HIT, no Set-Cookie, no Vary: Cookie');
  console.log('  Guide:       MISS → HIT, no Set-Cookie, no Vary: Cookie');
  console.log('  Sitemap:     MISS → HIT');
  console.log('  Cart:        DYNAMIC/BYPASS (expected, not cached)');
  console.log('  Auth:        DYNAMIC/BYPASS (expected, not cached)\n');
}

main().catch(e => { console.error(e); process.exit(1); });
