#!/usr/bin/env node
/**
 * P0 guard — anonymous storefront must always return products.
 *
 * Root incident (2026-06-30): a security-linter fix flipped
 * `products_public` to security_invoker=true. Because `products` has admin-only
 * RLS, every anonymous storefront query silently returned []. The site displayed
 * "0 items / We're updating this collection" for 3 days before detection.
 *
 * This script hits the anon PostgREST endpoint the same way the browser does and
 * fails CI if the public catalog drops below the minimum threshold.
 *
 * Usage: node scripts/smoke-anon-storefront.mjs
 * Env (required, no fallbacks): SUPABASE_URL, SUPABASE_ANON_KEY
 */
import { requireCiBackendEnv, describeFetchError } from './lib/ci-backend-env.mjs';

const { url: SUPABASE_URL, key: ANON_KEY, host } = requireCiBackendEnv();
console.log(`Backend host: ${host}`);

const MIN_TOTAL = 50;      // must have at least this many active products
const MIN_PER_SPECIES = 5; // dog + cat each

async function anonCount(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products_public?${query}`, {
    headers: { apikey: ANON_KEY, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1] ?? 0);
  return total;
}

const checks = [
  { name: 'all active products', query: 'select=id&is_active=eq.true', min: MIN_TOTAL },
  { name: 'dog products',        query: 'select=id&is_active=eq.true&primary_species=eq.dog', min: MIN_PER_SPECIES },
  { name: 'cat products',        query: 'select=id&is_active=eq.true&primary_species=eq.cat', min: MIN_PER_SPECIES },
];

let failed = 0;
for (const c of checks) {
  try {
    const n = await anonCount(c.query);
    const ok = n >= c.min;
    console.log(`${ok ? '✓' : '✗'} ${c.name}: ${n} (min ${c.min})`);
    if (!ok) failed++;
  } catch (e) {
    console.error(`✗ ${c.name}: ${describeFetchError(e)}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\nP0 STOREFRONT VISIBILITY FAILURE — ${failed} check(s) failed.`);
  console.error('Check GRANT SELECT ON public.products_public TO anon, and view security_invoker setting.');
  process.exit(1);
}
console.log('\nAnonymous storefront visibility OK.');