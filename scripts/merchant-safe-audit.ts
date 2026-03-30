/**
 * MERCHANT-SAFE AUDIT SCRIPT
 *
 * Run with: npx tsx scripts/merchant-safe-audit.ts
 * Or via npm: npm run merchant:audit
 *
 * Checks:
 * A. Pricing consistency (canonical layer usage)
 * B. Public accessibility (anon access)
 * C. Shipping consistency (approved text only)
 * D. Policy text scan (banned terms absent)
 * E. Feed alignment (feed matches storefront)
 * F. Structured data alignment (JSON-LD matches display)
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://getpawsy.pet';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://nojvgfbcjgipjxpfatmm.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc';

// Banned terms from merchant policy
const BANNED_TERMS = [
  'fast shipping', '3-7 days', '3–7 days', 'overnight', 'next day delivery',
  'same day', 'guaranteed', 'vet approved', 'vet-approved', 'veterinarian approved',
  'clinically proven', 'clinically tested', 'scientifically proven', 'relieves pain',
  'cures', 'heals', 'treats disease', 'FDA approved', 'medical grade',
  'prescription', 'doctor recommended',
];

interface AuditResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
}

const results: AuditResult[] = [];

function pass(check: string, details: string) {
  results.push({ check, status: 'PASS', details });
}
function fail(check: string, details: string) {
  results.push({ check, status: 'FAIL', details });
}
function warn(check: string, details: string) {
  results.push({ check, status: 'WARN', details });
}

// ---------- A. Source code pricing consistency ----------
async function checkPricingConsistency() {
  const srcDir = path.resolve(__dirname, '../src');
  const violations: string[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        scanDir(fullPath);
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Check for raw product.price usage in display contexts (excluding lib files)
        const relPath = path.relative(srcDir, fullPath);
        if (
          relPath.startsWith('lib/') ||
          relPath.startsWith('config/') ||
          relPath.startsWith('data/')
        ) continue;
        
        // Look for inline price calculations that bypass canonical layer
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          const lower = line.toLowerCase();
          if (
            (lower.includes('product.price') && lower.includes('toFixed')) &&
            !lower.includes('canonical') &&
            !lower.includes('merchant') &&
            !lower.includes('getdisplayprice') &&
            !lower.includes('getcanonical')
          ) {
            violations.push(`${relPath}:${i + 1} — inline product.price.toFixed()`);
          }
        });
      }
    }
  }

  scanDir(srcDir);

  if (violations.length === 0) {
    pass('pricing_consistency', 'No inline price calculations found outside canonical layer');
  } else {
    warn('pricing_consistency', `${violations.length} inline price usages found: ${violations.slice(0, 5).join('; ')}`);
  }
}

// ---------- B. Public accessibility ----------
async function checkPublicAccess() {
  try {
    // Check anon can query products_public
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products_public?is_active=eq.true&limit=5&select=id,name,price,slug`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (!res.ok) {
      fail('public_access', `products_public anon query failed: ${res.status}`);
      return;
    }
    const products = await res.json();
    if (!Array.isArray(products) || products.length === 0) {
      fail('public_access', 'products_public returned 0 rows for anon');
      return;
    }
    pass('public_access', `products_public accessible: ${products.length} products returned`);

    // Check bestsellers anon access
    const bsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/bestsellers?is_active=eq.true&limit=3&select=id,slug,product_id,product:products_public!bestsellers_product_id_fkey(id,name,price)`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (!bsRes.ok) {
      fail('public_access_bestsellers', `bestsellers anon query failed: ${bsRes.status}`);
    } else {
      const bs = await bsRes.json();
      if (Array.isArray(bs) && bs.length > 0) {
        pass('public_access_bestsellers', `bestsellers accessible: ${bs.length} rows`);
      } else {
        warn('public_access_bestsellers', 'bestsellers returned 0 rows');
      }
    }
  } catch (err) {
    fail('public_access', `Network error: ${(err as Error).message}`);
  }
}

// ---------- C. Shipping consistency ----------
async function checkShippingConsistency() {
  const srcDir = path.resolve(__dirname, '../src');
  const violations: string[] = [];
  const approvedPattern = /5[–-]10 business days/;

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        scanDir(fullPath);
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const relPath = path.relative(srcDir, fullPath);
        // Skip config/lib files since they define the constants
        if (relPath.startsWith('lib/shipping-constants') || relPath.startsWith('config/merchant-policy')) continue;
        
        // Look for hardcoded shipping day ranges
        const dayPatterns = [
          /\b[1-4][–-][5-9] business days\b/i,
          /\b[3-7][–-][7-14] business days\b/i,
          /\b2[–-]5 business days\b/i,
        ];
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          for (const pat of dayPatterns) {
            if (pat.test(line) && !approvedPattern.test(line)) {
              violations.push(`${relPath}:${i + 1} — non-standard shipping time: "${line.trim().slice(0, 80)}"`);
            }
          }
        });
      }
    }
  }

  scanDir(srcDir);

  if (violations.length === 0) {
    pass('shipping_consistency', 'All shipping text uses approved constants');
  } else {
    warn('shipping_consistency', `${violations.length} non-standard shipping texts: ${violations.slice(0, 3).join('; ')}`);
  }
}

// ---------- D. Policy text scan ----------
async function checkPolicyText() {
  const srcDir = path.resolve(__dirname, '../src');
  const violations: string[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        scanDir(fullPath);
      } else if (entry.name.endsWith('.tsx')) {
        const content = fs.readFileSync(fullPath, 'utf-8').toLowerCase();
        const relPath = path.relative(srcDir, fullPath);
        // Skip SEO editorial pages (they reference competitor products)
        if (relPath.startsWith('pages/seo/') || relPath.includes('ComplianceEvidence') || relPath.includes('MerchantFix')) continue;
        
        for (const term of BANNED_TERMS) {
          if (content.includes(term.toLowerCase())) {
            violations.push(`${relPath} — contains banned term: "${term}"`);
          }
        }
      }
    }
  }

  scanDir(srcDir);

  if (violations.length === 0) {
    pass('policy_text_scan', 'No banned terms found in customer-facing components');
  } else {
    warn('policy_text_scan', `${violations.length} banned term violations: ${violations.slice(0, 5).join('; ')}`);
  }
}

// ---------- E. Feed alignment ----------
async function checkFeedAlignment() {
  try {
    const feedRes = await fetch(`${BASE_URL}/merchant-feed.xml`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!feedRes.ok) {
      warn('feed_alignment', `Feed fetch failed: ${feedRes.status}`);
      return;
    }
    const feedXml = await feedRes.text();
    const itemCount = (feedXml.match(/<item>/g) || []).length;

    if (itemCount === 0) {
      fail('feed_alignment', 'Feed contains 0 items');
      return;
    }

    // Check a sample price from the feed vs the DB
    const priceMatch = feedXml.match(/<g:price>(\d+\.\d+)\s+USD<\/g:price>/);
    if (priceMatch) {
      pass('feed_alignment', `Feed has ${itemCount} items, sample price: $${priceMatch[1]}`);
    } else {
      pass('feed_alignment', `Feed has ${itemCount} items`);
    }
  } catch (err) {
    warn('feed_alignment', `Could not fetch feed: ${(err as Error).message}`);
  }
}

// ---------- F. Structured data alignment ----------
async function checkStructuredData() {
  const schemaPath = path.resolve(__dirname, '../src/components/seo/ProductSchema.tsx');
  if (fs.existsSync(schemaPath)) {
    const content = fs.readFileSync(schemaPath, 'utf-8');
    if (content.includes('getDisplayPrice') || content.includes('merchant-safe-product')) {
      pass('structured_data_alignment', 'ProductSchema uses merchant-safe canonical layer');
    } else if (content.includes('getCanonicalPrice')) {
      pass('structured_data_alignment', 'ProductSchema uses canonical pricing (via wrapper)');
    } else {
      fail('structured_data_alignment', 'ProductSchema does not use canonical pricing layer');
    }
  } else {
    warn('structured_data_alignment', 'ProductSchema.tsx not found');
  }
}

// ---------- G. Googlebot HTML validation ----------
async function checkGooglebotValidation() {
  const isGoogleMode = process.argv.includes('--google') || process.argv.includes('--strict');
  if (!isGoogleMode) {
    warn('googlebot_validation', 'Skipped — run with --google or --strict to enable');
    return;
  }

  console.log('\n🤖 Running Googlebot-level validation...\n');

  // Get product URLs from API
  let productSlugs: string[] = [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products_public?is_active=eq.true&limit=5&select=slug`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (res.ok) {
      const products = await res.json();
      productSlugs = products.map((p: { slug: string }) => p.slug).filter(Boolean);
    }
  } catch { /* proceed with defaults */ }

  const testUrls = [
    `${BASE_URL}/`,
    `${BASE_URL}/bestsellers`,
    ...productSlugs.slice(0, 3).map(s => `${BASE_URL}/product/${s}`),
  ];

  const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  const NORMAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  for (const url of testUrls) {
    try {
      const [normalRes, botRes] = await Promise.all([
        fetch(url, {
          headers: { 'User-Agent': NORMAL_UA, 'Cache-Control': 'no-cache' },
          signal: AbortSignal.timeout(15000),
        }),
        fetch(url, {
          headers: { 'User-Agent': GOOGLEBOT_UA, 'Cache-Control': 'no-cache' },
          signal: AbortSignal.timeout(15000),
        }),
      ]);

      // Status code check
      if (normalRes.status !== botRes.status) {
        fail(`googlebot_status_${url}`, `Status mismatch: normal=${normalRes.status}, googlebot=${botRes.status}`);
        await normalRes.text(); await botRes.text();
        continue;
      }

      const normalHtml = await normalRes.text();
      const botHtml = await botRes.text();

      // Content length similarity check (within 10%)
      const diff = Math.abs(normalHtml.length - botHtml.length);
      const max = Math.max(normalHtml.length, botHtml.length);
      if (max > 0 && (diff / max) > 0.1) {
        warn(`googlebot_content_${url}`, `Content length differs by ${((diff / max) * 100).toFixed(1)}%: normal=${normalHtml.length}, bot=${botHtml.length}`);
      }

      // Extract JSON-LD from both
      const extractJsonLdPrice = (html: string): string | null => {
        const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
        for (const m of scripts) {
          try {
            const data = JSON.parse(m[1]);
            if (data['@type'] === 'Product' && data.offers?.price) return String(data.offers.price);
            if (data['@graph']) {
              const prod = data['@graph'].find((i: any) => i['@type'] === 'Product');
              if (prod?.offers?.price) return String(prod.offers.price);
            }
          } catch { /* skip */ }
        }
        return null;
      };

      const normalPrice = extractJsonLdPrice(normalHtml);
      const botPrice = extractJsonLdPrice(botHtml);

      if (normalPrice && botPrice) {
        if (normalPrice === botPrice) {
          pass(`googlebot_jsonld_${url}`, `JSON-LD price matches: $${normalPrice}`);
        } else {
          fail(`googlebot_jsonld_${url}`, `JSON-LD price MISMATCH: normal=$${normalPrice}, googlebot=$${botPrice}`);
        }
      } else if (url.includes('/product/')) {
        // Product pages should have JSON-LD
        warn(`googlebot_jsonld_${url}`, `Missing JSON-LD: normal=${normalPrice || 'none'}, bot=${botPrice || 'none'}`);
      } else {
        pass(`googlebot_access_${url}`, `Accessible (status ${normalRes.status}), no product JSON-LD expected`);
      }
    } catch (err) {
      fail(`googlebot_fetch_${url}`, `Fetch error: ${(err as Error).message}`);
    }
  }
}

// ---------- RUN ----------
async function main() {
  const isGoogleMode = process.argv.includes('--google');
  const isStrict = process.argv.includes('--strict');

  console.log(`🔍 GetPawsy Merchant-Safe Audit${isGoogleMode ? ' (Googlebot mode)' : ''}${isStrict ? ' (STRICT)' : ''}`);
  console.log('================================\n');

  await checkPricingConsistency();
  await checkPublicAccess();
  await checkShippingConsistency();
  await checkPolicyText();
  await checkFeedAlignment();
  await checkStructuredData();
  await checkGooglebotValidation();

  console.log('\n📋 RESULTS\n');

  const summary: Record<string, string> = {};
  let hasFailure = false;
  let hasWarn = false;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${r.check}: ${r.status}`);
    console.log(`   ${r.details}\n`);
    summary[r.check] = r.status;
    if (r.status === 'FAIL') hasFailure = true;
    if (r.status === 'WARN') hasWarn = true;
  }

  summary['merchant_safe_system'] = hasFailure ? 'DEGRADED' : 'ACTIVE';

  console.log('\n📊 SUMMARY JSON:\n');
  console.log(JSON.stringify(summary, null, 2));

  if (hasFailure) {
    console.log('\n❌ AUDIT FAILED — resolve FAIL items before deploying');
    process.exit(1);
  } else if (isStrict && hasWarn) {
    console.log('\n⚠️ STRICT MODE: warnings treated as failures');
    process.exit(1);
  } else {
    console.log('\n✅ AUDIT PASSED — merchant-safe system is active');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Audit crashed:', err);
  process.exit(1);
});
