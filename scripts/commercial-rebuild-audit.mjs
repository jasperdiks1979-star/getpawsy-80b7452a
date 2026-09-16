#!/usr/bin/env node
/**
 * READ-ONLY commercial rebuild catalog audit.
 *
 * Input : /tmp/audit/products.json  (one JSON object per line, exported from the
 *         production catalog with psql COPY — see docs/commercial-rebuild/README.md)
 * Output: docs/commercial-rebuild/catalog-audit.csv
 *         docs/commercial-rebuild/catalog-audit.json
 *         docs/commercial-rebuild/summary.json
 *
 * The script never writes to the database. Scoring is fully deterministic and
 * every component is emitted per product so the score can be re-derived by hand.
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || '/tmp/audit/products.json';
const OUT = 'docs/commercial-rebuild';
fs.mkdirSync(OUT, { recursive: true });

const rows = JSON.parse(fs.readFileSync(SRC, 'utf8'));

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v) => (v == null ? '' : String(v));
const lc = (p) => `${txt(p.name)} ${txt(p.name_clean)} ${txt(p.category)} ${txt(p.product_type)} ${txt(p.description)}`.toLowerCase();

const PROBLEM_WORDS = [
  'odor', 'odour', 'smell', 'tracking', 'splash', 'litter', 'scratch', 'hair', 'shed',
  'anti-slip', 'nonslip', 'non-slip', 'waterproof', 'self-clean', 'self clean', 'hide',
  'anxiety', 'calming', 'orthopedic', 'joint', 'slow feeder', 'hairball', 'dental',
];
const DIFF_WORDS = [
  'flip', 'dual', 'modular', 'foldable', 'convertible', 'multi-level', 'enclosed',
  'hidden', 'furniture', 'rotat', 'sisal', 'automatic', 'sensor', 'transparent', 'space capsule',
];
const UGC_STRONG = ['tree', 'condo', 'tower', 'litter', 'house', 'bed', 'hammock', 'window', 'perch', 'cave', 'tunnel', 'wheel'];
const BUNDLE_STRONG = ['litter', 'mat', 'scoop', 'bowl', 'toy', 'brush', 'scratch', 'bed', 'blanket', 'liner'];
const FRAGILE = ['glass', 'ceramic', 'mirror', 'aquarium'];

function score(p) {
  const c = {};
  const ev = [];
  const inf = [];
  const price = num(p.price) ?? 0;
  const cost = num(p.landed_cost) ?? num(p.cost_price);
  const marginPct = cost && price > 0 ? ((price - cost) / price) * 100 : null;

  // 1. Margin (15)
  if (marginPct === null) {
    c.margin = 0;
    inf.push('no supplier cost on record — margin unknown, scored 0');
  } else {
    ev.push(`margin ${marginPct.toFixed(1)}% (price ${price}, cost ${cost})`);
    c.margin = marginPct >= 70 ? 15 : marginPct >= 60 ? 13 : marginPct >= 50 ? 11 : marginPct >= 40 ? 8 : marginPct >= 30 ? 5 : marginPct >= 20 ? 2 : 0;
  }

  // 2. US warehouse / reliable stock (15)
  const us = num(p.us_stock) ?? 0;
  const eu = num(p.eu_stock) ?? 0;
  const cn = num(p.cn_stock) ?? 0;
  const stock = num(p.stock) ?? 0;
  const eff = num(p.effective_stock) ?? Math.max(us + eu + cn, stock);
  // Variant payload often carries per-warehouse inventory the columns have not absorbed yet.
  let variantUs = 0;
  let variantAny = 0;
  for (const v of Array.isArray(p.variants) ? p.variants : []) {
    for (const inv of Array.isArray(v.inventories) ? v.inventories : []) {
      const n = Number(inv.cjInventory ?? inv.totalInventory ?? 0) || 0;
      variantAny += n;
      if (String(inv.countryCode || '').toUpperCase() === 'US') variantUs += n;
    }
  }
  if (us >= 20) c.us_stock = 15;
  else if (us > 0) c.us_stock = 12;
  else if (eu > 0) c.us_stock = 7;
  else if (cn > 0) c.us_stock = 5;
  else if (eff > 0) c.us_stock = 4;
  else c.us_stock = 0;
  if (c.us_stock === 0 && variantUs > 0) { c.us_stock = 6; inf.push(`column stock is 0 but CJ variant payload reports ${variantUs} US units — needs re-sync before trusting`); }
  ev.push(`stock us=${us} eu=${eu} cn=${cn} effective=${eff}; variant payload us=${variantUs} total=${variantAny}`);

  // 3. Shipping reliability (10)
  const dmax = num(p.shipping_days_max);
  if (p.is_us_warehouse && p.is_fast_shipping) c.shipping = 10;
  else if (us > 0) c.shipping = 8;
  else if (dmax && dmax <= 12) c.shipping = 6;
  else if (dmax && dmax <= 20) c.shipping = 4;
  else c.shipping = 2;
  if (dmax) ev.push(`shipping window ${num(p.shipping_days_min) ?? '?'}-${dmax}d`);
  else inf.push('no shipping window on record — conservative shipping score');

  // 4. Problem solved (10) — inferred from title/description language
  const t = lc(p);
  const hits = PROBLEM_WORDS.filter((w) => t.includes(w));
  c.problem = Math.min(10, hits.length * 3);
  if (hits.length) inf.push(`problem signals: ${hits.slice(0, 4).join(', ')}`);

  // 5. Differentiation (10)
  const dhits = DIFF_WORDS.filter((w) => t.includes(w));
  c.differentiation = Math.min(10, dhits.length * 3 + (p.is_duplicate ? 0 : 1));
  if (dhits.length) inf.push(`differentiators: ${dhits.slice(0, 4).join(', ')}`);

  // 6. Spec / quality confidence (10)
  const q = num(p.quality_score);
  const cr = num(p.content_readiness_score);
  const descLen = txt(p.optimized_description || p.description).length;
  let spec = 0;
  if (q != null) spec = Math.round((Math.min(100, q) / 100) * 6);
  else if (cr != null) spec = Math.round((Math.min(100, cr) / 100) * 6);
  else inf.push('no quality/readiness score — spec confidence from copy length only');
  spec += descLen > 1200 ? 4 : descLen > 600 ? 3 : descLen > 250 ? 2 : descLen > 80 ? 1 : 0;
  c.spec = Math.min(10, spec);
  ev.push(`description ${descLen} chars, quality_score=${q ?? 'n/a'}`);

  // 7. Visual appeal (8)
  const imgs = num(p.image_count) ?? 0;
  c.visual = imgs >= 6 ? 8 : imgs >= 4 ? 6 : imgs >= 2 ? 4 : p.image_url ? 2 : 0;
  ev.push(`${imgs} gallery images${p.image_url ? ' + primary' : ' + NO primary image'}`);

  // 8. UGC potential (7)
  c.ugc = UGC_STRONG.some((w) => t.includes(w)) ? 7 : imgs >= 4 ? 4 : 2;

  // 9. Bundle potential (5)
  c.bundle = BUNDLE_STRONG.some((w) => t.includes(w)) ? 5 : 2;

  // 10. Return / damage risk (5, higher = safer)
  const w = num(p.weight) ?? null;
  let risk = 5;
  if (FRAGILE.some((f) => t.includes(f))) risk -= 3;
  if (w && w > 15) risk -= 2;
  else if (w && w > 8) risk -= 1;
  if (w == null) { risk -= 1; inf.push('no weight on record — damage risk partly inferred'); }
  c.return_risk = Math.max(0, risk);

  // 11. Supplier reliability (5)
  const syncAt = p.last_inventory_sync_at || p.last_stock_sync_at;
  const days = syncAt ? (Date.now() - Date.parse(syncAt)) / 86400000 : null;
  let sup = 0;
  if (p.cj_product_id) sup += 2;
  if (txt(p.supplier_status).toLowerCase() === 'active') sup += 1;
  if (days != null && days <= 7) sup += 2;
  else if (days != null && days <= 30) sup += 1;
  else inf.push('inventory sync stale or never run');
  c.supplier = Math.min(5, sup);

  const total = Object.values(c).reduce((a, b) => a + b, 0);

  // Hard gates
  const gates = [];
  if (!p.cj_product_id) gates.push('NO_SUPPLIER_MAPPING');
  if (txt(p.supplier_status).toLowerCase() === 'discontinued') gates.push('UNRELIABLE_SUPPLIER');
  if (p.variant_count > 0 && !Array.isArray(p.variants)) gates.push('INVALID_VARIANT_MAPPING');
  if (eff <= 0 && stock <= 0) gates.push('NO_REAL_STOCK');
  if (us <= 0 && eu <= 0 && cn <= 0 && stock <= 0) gates.push('NO_US_DELIVERY_PATH');
  if (!p.supplier_warehouse && !p.warehouse_country && !p.primary_warehouse) gates.push('UNKNOWN_WAREHOUSE');
  if (!dmax) gates.push('UNUSABLE_SHIPPING_PROMISE');
  if (descLen < 250) gates.push('INSUFFICIENT_SPECS');
  if (marginPct !== null && marginPct < 35) gates.push('UNACCEPTABLE_MARGIN');
  if (marginPct === null) gates.push('MARGIN_UNKNOWN');
  if (p.is_duplicate) gates.push('DUPLICATE');
  if (p.needs_admin_review) gates.push(`ADMIN_REVIEW:${txt(p.admin_review_reason) || 'flagged'}`);
  if (!p.image_url || imgs === 0) gates.push('MISSING_IMAGERY');
  if (p.inventory_manual_block) gates.push('INVENTORY_BLOCKED');

  const blocking = gates.filter((g) => !g.startsWith('ADMIN_REVIEW') && g !== 'MARGIN_UNKNOWN');

  // Preliminary role (no catalog mutation)
  const cat = txt(p.primary_species).toLowerCase();
  let role;
  if (blocking.length >= 3 || c.us_stock === 0) role = 'RETIRE_CANDIDATE';
  else if (total >= 72 && blocking.length === 0 && us > 0 && cat === 'cat') role = 'HERO_CANDIDATE';
  else if (total >= 60 && blocking.length <= 1) role = 'CORE_CANDIDATE';
  else if (total >= 48 && price < 40) role = 'ACCESSORY_CANDIDATE';
  else if (total >= 45) role = 'LONGTAIL';
  else role = 'RETIRE_CANDIDATE';

  return {
    id: p.id,
    slug: p.slug,
    title: p.name_clean || p.name,
    status: p.is_active ? 'active' : 'inactive',
    visible: Boolean(p.is_active && !p.is_duplicate && eff > 0),
    species: p.primary_species,
    category: p.category,
    product_type: p.product_type,
    price,
    compare_at_price: num(p.compare_at_price),
    cost: cost ?? null,
    margin_pct: marginPct === null ? null : Number(marginPct.toFixed(1)),
    cj_product_id: p.cj_product_id,
    supplier_name: p.supplier_name,
    supplier_status: p.supplier_status,
    variant_count: p.variant_count,
    stock,
    us_stock: us,
    eu_stock: eu,
    cn_stock: cn,
    effective_stock: eff,
    warehouse: p.supplier_warehouse || p.primary_warehouse || p.warehouse_country || null,
    us_available: us > 0,
    shipping_days: dmax ? `${num(p.shipping_days_min) ?? '?'}-${dmax}` : null,
    weight: w,
    image_count: imgs,
    description_chars: descLen,
    quality_score: q,
    seo_tier: p.seo_tier,
    indexable: Boolean(p.is_active && p.slug && p.meta_title),
    dedupe_key: p.dedupe_key,
    duplicate_risk: p.is_duplicate ? 'confirmed' : p.canonical_product_id ? 'linked' : 'none-detected',
    views_90d: num(p.views_90d) ?? 0,
    atc_90d: num(p.atc_90d) ?? 0,
    units_sold: num(p.units_sold) ?? 0,
    revenue: num(p.revenue) ?? 0,
    ...Object.fromEntries(Object.entries(c).map(([k, v]) => [`s_${k}`, v])),
    score_total: total,
    hard_gates: gates.join('|'),
    blocking_gates: blocking.length,
    role,
    evidence: ev.join('; '),
    inference: inf.join('; '),
  };
}

const scored = rows.map(score).sort((a, b) => b.score_total - a.score_total);

const cols = Object.keys(scored[0]);
const csv = [cols.join(',')]
  .concat(scored.map((r) => cols.map((k) => {
    const v = r[k] ?? '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')))
  .join('\n');

fs.writeFileSync(path.join(OUT, 'catalog-audit.csv'), csv);
fs.writeFileSync(path.join(OUT, 'catalog-audit.json'), JSON.stringify(scored, null, 2));

const by = (f) => scored.reduce((m, r) => { const k = f(r) ?? 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
const gateCounts = {};
for (const r of scored) for (const g of r.hard_gates.split('|').filter(Boolean)) {
  const key = g.split(':')[0];
  gateCounts[key] = (gateCounts[key] || 0) + 1;
}
const summary = {
  generated_at: new Date().toISOString(),
  source: 'production catalog (read-only export)',
  total_products: scored.length,
  active: scored.filter((r) => r.status === 'active').length,
  commercially_visible: scored.filter((r) => r.visible).length,
  us_stocked: scored.filter((r) => r.us_available).length,
  with_cost_data: scored.filter((r) => r.margin_pct !== null).length,
  clean_no_blocking_gates: scored.filter((r) => r.blocking_gates === 0).length,
  by_role: by((r) => r.role),
  by_species: by((r) => r.species),
  gate_counts: gateCounts,
  score_distribution: {
    '80+': scored.filter((r) => r.score_total >= 80).length,
    '70-79': scored.filter((r) => r.score_total >= 70 && r.score_total < 80).length,
    '60-69': scored.filter((r) => r.score_total >= 60 && r.score_total < 70).length,
    '45-59': scored.filter((r) => r.score_total >= 45 && r.score_total < 60).length,
    '<45': scored.filter((r) => r.score_total < 45).length,
  },
  top_25: scored.slice(0, 25).map((r) => ({
    slug: r.slug, title: r.title, score: r.score_total, role: r.role,
    price: r.price, margin_pct: r.margin_pct, us_stock: r.us_stock,
    views_90d: r.views_90d, gates: r.hard_gates,
  })),
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2).slice(0, 4000));
