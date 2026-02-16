#!/usr/bin/env node

/**
 * GetPawsy — SEO + Conversion Impact Model (US-ONLY CLEAN DATA)
 * 
 * Estimates the business impact of CWV improvements using ONLY US real-user data.
 * Excludes: Netherlands, test traffic, bot traffic.
 * 
 * Usage: node scripts/impact-model.mjs
 * 
 * Override with env vars (US-only metrics):
 *   US_SESSIONS=300 US_ORDERS=5 AOV=42 US_IMPRESSIONS=8000 US_CLICKS=100 node scripts/impact-model.mjs
 *
 * Optional exclusion counters (for sanity check output):
 *   NL_SESSIONS=200 TEST_SESSIONS=10 BOT_SESSIONS=50 node scripts/impact-model.mjs
 */

// ─── Editable Constants ───────────────────────────────────────────
const LCP_BEFORE = 3.8;  // seconds
const LCP_AFTER = 1.3;   // seconds
const CWV_GOOD_BEFORE = 0.30; // 30%
const CWV_GOOD_AFTER = 0.85;  // 85%

// ─── Uplift Assumptions (relative %) ──────────────────────────────
const IMPRESSION_UPLIFT = { low: 0.05, mid: 0.10, high: 0.15 };
const CTR_UPLIFT        = { low: 0.00, mid: 0.025, high: 0.05 };
const CVR_UPLIFT        = { low: 0.02, mid: 0.035, high: 0.05 };

// ─── Baseline Data (US-ONLY, env vars or defaults) ────────────────
const env = (key, fallback) => {
  const v = process.env[key];
  return v !== undefined ? parseFloat(v) : fallback;
};

// US-only metrics (primary inputs)
const usSessions    = env('US_SESSIONS', 300);
const usOrders      = env('US_ORDERS', Math.round(300 * 0.015));
const cvr           = usOrders / usSessions;
const aov           = env('AOV', 35);
const revenue       = usOrders * aov;
const usImpressions = env('US_IMPRESSIONS', 8000);
const usClicks      = env('US_CLICKS', Math.round(8000 * 0.012));
const ctr           = usClicks / usImpressions;

// Exclusion counters (for sanity check — informational only)
const nlSessions   = env('NL_SESSIONS', 0);
const testSessions = env('TEST_SESSIONS', 0);
const botSessions  = env('BOT_SESSIONS', 0);
const nlPurchases  = env('NL_PURCHASES', 0);

// ─── Sample Size Warning ─────────────────────────────────────────
const MINIMUM_SESSIONS = 50;

// ─── Model ────────────────────────────────────────────────────────
function scenario(label, impUplift, ctrUplift, cvrUplift) {
  const newImpressions = Math.round(usImpressions * (1 + impUplift));
  const newCtr = ctr * (1 + ctrUplift);
  const newClicks = Math.round(newImpressions * newCtr);
  const newSessions = usSessions + (newClicks - usClicks);
  const newCvr = cvr * (1 + cvrUplift);
  const newOrders = Math.round(newSessions * newCvr);
  const newRevenue = newOrders * aov;

  return {
    label,
    deltaImpressions: newImpressions - usImpressions,
    deltaClicks: newClicks - usClicks,
    deltaSessions: newSessions - usSessions,
    deltaOrders: newOrders - usOrders,
    deltaRevenue: newRevenue - revenue,
  };
}

const results = [
  scenario('LOW',  IMPRESSION_UPLIFT.low,  CTR_UPLIFT.low,  CVR_UPLIFT.low),
  scenario('MID',  IMPRESSION_UPLIFT.mid,  CTR_UPLIFT.mid,  CVR_UPLIFT.mid),
  scenario('HIGH', IMPRESSION_UPLIFT.high, CTR_UPLIFT.high, CVR_UPLIFT.high),
];

// ─── Output ───────────────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║   GetPawsy — US-ONLY CLEAN DATA IMPACT MODEL            ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

// ─── Data Source Sanity Check ─────────────────────────────────────
console.log('────────────────────────────────────────');
console.log('  DATA SOURCE SANITY CHECK');
console.log('────────────────────────────────────────');
console.log(`  US Sessions:           ${usSessions}`);
console.log(`  US Purchases:          ${usOrders}`);
console.log(`  Excluded NL Sessions:  ${nlSessions}`);
console.log(`  Excluded NL Purchases: ${nlPurchases}`);
console.log(`  Excluded Test Sessions:${testSessions}`);
console.log(`  Excluded Bot Sessions: ${botSessions}`);
console.log('────────────────────────────────────────\n');

if (usSessions < MINIMUM_SESSIONS) {
  console.warn('⚠️  WARNING: Sample size too small for reliable projection');
  console.warn(`   US sessions (${usSessions}) < minimum threshold (${MINIMUM_SESSIONS})`);
  console.warn('   Results below are directional estimates only.\n');
}

console.log('📊 CWV Improvement:');
console.log(`   LCP P75 (mobile):  ${LCP_BEFORE}s → ${LCP_AFTER}s`);
console.log(`   CWV Good rate:     ${(CWV_GOOD_BEFORE * 100).toFixed(0)}% → ${(CWV_GOOD_AFTER * 100).toFixed(0)}%\n`);

console.log('📈 US-Only Baseline (28-day):');
console.log(`   Sessions:     ${usSessions}`);
console.log(`   Orders:       ${usOrders} (CVR: ${(cvr * 100).toFixed(2)}%)`);
console.log(`   AOV:          $${aov}`);
console.log(`   Revenue:      $${revenue}`);
console.log(`   Impressions:  ${usImpressions.toLocaleString()}`);
console.log(`   Clicks:       ${usClicks} (CTR: ${(ctr * 100).toFixed(2)}%)\n`);

const pad = (s, n) => String(s).padStart(n);
const header = `${'Scenario'.padEnd(10)} ${'Δ Impr'.padStart(8)} ${'Δ Clicks'.padStart(9)} ${'Δ Sessions'.padStart(11)} ${'Δ Orders'.padStart(9)} ${'Δ Revenue'.padStart(10)}`;
console.log('─'.repeat(header.length));
console.log(header);
console.log('─'.repeat(header.length));

for (const r of results) {
  console.log(
    `${r.label.padEnd(10)} ${pad('+' + r.deltaImpressions, 8)} ${pad('+' + r.deltaClicks, 9)} ${pad('+' + r.deltaSessions, 11)} ${pad('+' + r.deltaOrders, 9)} ${pad('+$' + r.deltaRevenue, 10)}`
  );
}
console.log('─'.repeat(header.length));

console.log('\n⚠️  Caveats:');
console.log('   • ALL metrics are US-only (NL, test, and bot traffic excluded)');
console.log('   • Estimates assume CWV is a meaningful ranking signal for your niche');
console.log('   • Actual impact depends on competition, content quality, backlinks, indexing state');
console.log('   • Revenue estimates use AOV × incremental orders (not LTV)');
console.log('   • Override: US_SESSIONS=300 US_ORDERS=5 AOV=42 node scripts/impact-model.mjs');

console.log('\n📋 GSC Verification Checklist:');
console.log('   1. GSC → Page Experience → Core Web Vitals (Mobile) — check weekly for 4 weeks');
console.log('   2. GSC → URL Inspection → Live Test on key category pages');
console.log('   3. GSC → Performance → compare 28-day windows (before vs after)');
console.log('   4. Wait 28 days for field data to accumulate before drawing conclusions');
console.log('   5. Full guide: docs/post-deploy-verification.md');
console.log('   6. Data policy: docs/analytics-data-policy.md\n');

console.info('Projected CWV improvement applied — US-ONLY CLEAN DATA MODEL');
