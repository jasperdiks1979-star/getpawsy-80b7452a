#!/usr/bin/env node

/**
 * GetPawsy — SEO + Conversion Impact Model
 * 
 * Estimates the business impact of CWV improvements.
 * Uses real GA4/GSC data when available, otherwise uses safe defaults.
 * 
 * Usage: node scripts/impact-model.mjs
 * 
 * Override defaults with env vars:
 *   SESSIONS=800 ORDERS=15 AOV=42 IMPRESSIONS=15000 CLICKS=200 node scripts/impact-model.mjs
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

// ─── Baseline Data (env vars or defaults) ─────────────────────────
const env = (key, fallback) => {
  const v = process.env[key];
  return v !== undefined ? parseFloat(v) : fallback;
};

const sessions    = env('SESSIONS', 500);
const orders      = env('ORDERS', Math.round(500 * 0.015));
const cvr         = orders / sessions;
const aov         = env('AOV', 35);
const revenue     = orders * aov;
const impressions = env('IMPRESSIONS', 10000);
const clicks      = env('CLICKS', Math.round(10000 * 0.01));
const ctr         = clicks / impressions;

// ─── Model ────────────────────────────────────────────────────────
function scenario(label, impUplift, ctrUplift, cvrUplift) {
  const newImpressions = Math.round(impressions * (1 + impUplift));
  const newCtr = ctr * (1 + ctrUplift);
  const newClicks = Math.round(newImpressions * newCtr);
  const newSessions = sessions + (newClicks - clicks);
  const newCvr = cvr * (1 + cvrUplift);
  const newOrders = Math.round(newSessions * newCvr);
  const newRevenue = newOrders * aov;

  return {
    label,
    deltaImpressions: newImpressions - impressions,
    deltaClicks: newClicks - clicks,
    deltaSessions: newSessions - sessions,
    deltaOrders: newOrders - orders,
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
console.log('║   GetPawsy — SEO + Conversion Impact Model              ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

console.log('📊 CWV Improvement:');
console.log(`   LCP P75 (mobile):  ${LCP_BEFORE}s → ${LCP_AFTER}s`);
console.log(`   CWV Good rate:     ${(CWV_GOOD_BEFORE * 100).toFixed(0)}% → ${(CWV_GOOD_AFTER * 100).toFixed(0)}%\n`);

console.log('📈 Baseline (28-day):');
console.log(`   Sessions:     ${sessions}`);
console.log(`   Orders:       ${orders} (CVR: ${(cvr * 100).toFixed(2)}%)`);
console.log(`   AOV:          $${aov}`);
console.log(`   Revenue:      $${revenue}`);
console.log(`   Impressions:  ${impressions.toLocaleString()}`);
console.log(`   Clicks:       ${clicks} (CTR: ${(ctr * 100).toFixed(2)}%)\n`);

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
console.log('   • Estimates assume CWV is a meaningful ranking signal for your niche');
console.log('   • Actual impact depends on competition, content quality, backlinks, indexing state');
console.log('   • Revenue estimates use AOV × incremental orders (not LTV)');
console.log('   • Override defaults: SESSIONS=800 ORDERS=15 AOV=42 node scripts/impact-model.mjs');

console.log('\n📋 GSC Verification Checklist:');
console.log('   1. GSC → Page Experience → Core Web Vitals (Mobile) — check weekly for 4 weeks');
console.log('   2. GSC → URL Inspection → Live Test on key category pages');
console.log('   3. GSC → Performance → compare 28-day windows (before vs after)');
console.log('   4. Wait 28 days for field data to accumulate before drawing conclusions');
console.log('   5. Full guide: docs/post-deploy-verification.md\n');
