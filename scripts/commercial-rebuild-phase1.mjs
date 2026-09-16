#!/usr/bin/env node
/**
 * Phase 1 — non-destructive assortment design.
 *
 * Reads the Phase 0 audit (docs/commercial-rebuild/catalog-audit.json) plus the raw
 * read-only catalog export (/tmp/audit/products.json) and produces the Phase 1
 * proposal documents. It writes ONLY to docs/commercial-rebuild/phase1/.
 * No database write, no supplier call, no external action.
 */
import fs from 'node:fs';
import path from 'node:path';

const RAW = process.argv[2] || '/tmp/audit/products.json';
const OUT = 'docs/commercial-rebuild/phase1';
fs.mkdirSync(OUT, { recursive: true });

const audit = JSON.parse(fs.readFileSync('docs/commercial-rebuild/catalog-audit.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const rawById = new Map(raw.map((r) => [r.id, r]));

const DAY = 86400000;
const now = Date.now();

/* ---------- 1. Supplier / warehouse / delivery truth refresh (DB + variant payload) ---------- */

function deliveryTruth(r) {
  const variants = Array.isArray(r.variants) ? r.variants : [];
  let payloadUs = 0;
  let payloadTotal = 0;
  let verifiedUsWarehouse = false;
  const countries = new Set();
  for (const v of variants) {
    for (const inv of Array.isArray(v.inventories) ? v.inventories : []) {
      const n = Number(inv.cjInventory ?? inv.totalInventory ?? 0) || 0;
      const cc = String(inv.countryCode || '').toUpperCase();
      payloadTotal += n;
      if (cc) countries.add(cc);
      if (cc === 'US') {
        payloadUs += n;
        if (inv.verifiedWarehouse === 1 && n > 0) verifiedUsWarehouse = true;
      }
    }
  }
  const syncAt = r.last_inventory_sync_at || r.last_stock_sync_at;
  const syncAgeDays = syncAt ? Math.round((now - Date.parse(syncAt)) / DAY) : null;
  const colUs = Number(r.us_stock || 0);

  // Confidence ladder — never asserts an ETA that is not backed by data.
  let confidence;
  let etaStatement;
  if (verifiedUsWarehouse && colUs > 0 && syncAgeDays !== null && syncAgeDays <= 30) {
    confidence = 'high';
    etaStatement = 'US warehouse confirmed (verified CJ warehouse + stock columns agree). Delivery window still NOT stored — must be fetched before any on-site promise.';
  } else if (colUs > 0 || verifiedUsWarehouse) {
    confidence = 'medium';
    etaStatement = 'US stock indicated by one source only (column or CJ payload). Needs re-sync confirmation. No delivery window on record.';
  } else if (payloadTotal > 0 || Number(r.stock || 0) > 0) {
    confidence = 'low';
    etaStatement = 'Stock exists but not verified as US. Overseas lane likely. No delivery window on record.';
  } else {
    confidence = 'none';
    etaStatement = 'No stock evidence from any source. Not sellable.';
  }
  const conflict = (colUs === 0 && payloadUs > 0) || (colUs > 0 && payloadUs === 0 && payloadTotal > 0);
  return {
    payload_us_units: payloadUs,
    payload_total_units: payloadTotal,
    payload_countries: [...countries].join('/') || null,
    verified_us_warehouse: verifiedUsWarehouse,
    inventory_sync_age_days: syncAgeDays,
    stock_source_conflict: conflict,
    delivery_confidence: confidence,
    delivery_statement: etaStatement,
    shipping_days_on_record: r.shipping_days_max ? `${r.shipping_days_min ?? '?'}-${r.shipping_days_max}` : null,
  };
}

const enriched = audit.map((a) => {
  const r = rawById.get(a.id) || {};
  return { ...a, ...deliveryTruth(r), supplier_sync_status: r.stock_sync_status ?? null, cj_variant_ids: (Array.isArray(r.variants) ? r.variants : []).map((v) => v.vid).filter(Boolean) };
});
const byId = new Map(enriched.map((p) => [p.id, p]));

/* ---------- 2. Duplicate + near-duplicate resolution (on paper) ---------- */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const clusterKey = (p) => {
  const r = rawById.get(p.id) || {};
  const base = norm(r.dedupe_key || p.title);
  return base.split(' ').slice(0, 6).join(' ');
};

const clusters = new Map();
for (const p of enriched) {
  const k = clusterKey(p);
  if (!k) continue;
  if (!clusters.has(k)) clusters.set(k, []);
  clusters.get(k).push(p);
}

function rankForKeep(a, b) {
  // Deterministic: US stock first, then no blocking gates, then score, then views, then id.
  const s = (p) => [p.us_stock > 0 ? 1 : 0, p.blocking_gates === 0 ? 1 : 0, p.score_total, p.views_90d, p.image_count];
  const sa = s(a); const sb = s(b);
  for (let i = 0; i < sa.length; i++) if (sb[i] !== sa[i]) return sb[i] - sa[i];
  return a.id.localeCompare(b.id);
}

const duplicateResolution = [];
for (const [key, members] of clusters) {
  const flagged = members.filter((m) => m.duplicate_risk !== 'none-detected');
  if (members.length < 2 && flagged.length === 0) continue;
  const sorted = [...members].sort(rankForKeep);
  const keep = sorted[0];
  const rest = sorted.slice(1);
  duplicateResolution.push({
    cluster_key: key,
    size: members.length,
    keep: { slug: keep.slug, id: keep.id, score: keep.score_total, us_stock: keep.us_stock, views_90d: keep.views_90d },
    keep_reason: `highest ranked on (US stock ${keep.us_stock}, blocking gates ${keep.blocking_gates}, score ${keep.score_total}, 90d views ${keep.views_90d})`,
    actions: rest.map((m) => {
      const sameTitle = norm(m.title) === norm(keep.title);
      const action = m.us_stock === 0 || m.blocking_gates >= 2 ? 'RETIRE'
        : sameTitle ? 'MERGE_INTO_KEEP'
        : 'KEEP_AS_VARIANT_OF_CLUSTER';
      return {
        slug: m.slug, id: m.id, score: m.score_total, us_stock: m.us_stock,
        action,
        reason: action === 'RETIRE'
          ? `no US stock (${m.us_stock}) or ${m.blocking_gates} blocking gates`
          : action === 'MERGE_INTO_KEEP'
            ? 'same normalised title as the keeper — consolidate URL and redirect'
            : 'distinct enough to survive as a separate listing once copy differentiates it',
      };
    }),
  });
}
duplicateResolution.sort((a, b) => b.size - a.size);
const retireFromDupes = new Set(duplicateResolution.flatMap((c) => c.actions.filter((a) => a.action !== 'KEEP_AS_VARIANT_OF_CLUSTER').map((a) => a.id)));

/* ---------- 3. Assortment proposal ---------- */

const PROBLEM = (p) => {
  const t = `${p.title} ${p.category}`.toLowerCase();
  if (t.includes('litter')) return 'Litter odour, tracking and mess in a small indoor home';
  if (t.includes('tree') || t.includes('tower') || t.includes('condo')) return 'Vertical territory and scratching that protects furniture';
  if (t.includes('scratch')) return 'Redirects scratching away from sofas and carpets';
  if (t.includes('bed') || t.includes('cave') || t.includes('hammock')) return 'Warm, safe resting spot for an indoor cat';
  if (t.includes('house') || t.includes('stair') || t.includes('step')) return 'Indoor-home furniture that fits the cat into the living space';
  if (t.includes('bowl') || t.includes('feeder') || t.includes('fountain')) return 'Clean, controlled feeding and hydration';
  if (t.includes('toy') || t.includes('wheel') || t.includes('tunnel')) return 'Indoor enrichment and exercise';
  if (t.includes('groom') || t.includes('brush')) return 'Shedding and hairball control';
  if (t.includes('carrier')) return 'Low-stress transport to the vet';
  return 'General indoor-cat comfort';
};

const eligible = enriched.filter((p) =>
  (p.species === 'cat' || p.species === 'both') &&
  p.status === 'active' &&
  p.us_stock > 0 &&
  p.blocking_gates === 0 &&
  !retireFromDupes.has(p.id) &&
  p.duplicate_risk !== 'confirmed');

// Heroes: max one per sub-format so the top of the range is not five litter boxes.
const heroFormat = (p) => {
  const t = p.title.toLowerCase();
  if (t.includes('litter')) {
    if (t.includes('top entry') || t.includes('top-entry')) return 'litter-top-entry';
    if (t.includes('stainless') || t.includes('extra large') || t.includes('xl')) return 'litter-premium-xl';
    return 'litter-enclosed';
  }
  if (t.includes('tree') || t.includes('tower') || t.includes('condo')) return 'cat-tower';
  if (t.includes('stair') || t.includes('step') || t.includes('house') || t.includes('shelf')) return 'cat-furniture';
  if (t.includes('bed') || t.includes('cave') || t.includes('hammock')) return 'cat-bed';
  return 'other';
};

const heroPool = eligible
  .filter((p) => p.margin_pct !== null && p.us_stock >= 20 && p.image_count >= 2 && p.delivery_confidence !== 'none')
  .sort((a, b) => (b.score_total - a.score_total) || (b.views_90d - a.views_90d) || (b.margin_pct - a.margin_pct));

const heroes = [];
const usedFormats = new Set();
for (const p of heroPool) {
  const f = heroFormat(p);
  if (usedFormats.has(f)) continue;
  heroes.push(p);
  usedFormats.add(f);
  if (heroes.length === 5) break;
}
const heroIds = new Set(heroes.map((h) => h.id));

// Core range: strongest remaining cat products, capped per category for breadth.
const CATEGORY_CAP = { 'Cat Litter Boxes': 12, 'Cat Trees & Condos': 12, 'Cat Toys': 9, 'Cat Beds': 7, 'Cat Houses': 6, 'Cat Scratching Posts': 6, 'Cat Bowls & Feeders': 5, 'Cat Carriers': 4, 'Cat Grooming': 4, 'Cat Collars & Accessories': 4 };
const catCount = {};
const core = [];
const accessories = [];
for (const p of eligible.filter((p) => !heroIds.has(p.id)).sort((a, b) => b.score_total - a.score_total)) {
  const cat = p.category || 'Other';
  const cap = CATEGORY_CAP[cat] ?? 2;
  if ((catCount[cat] || 0) >= cap) continue;
  const isAccessory = p.price < 40;
  if (isAccessory) {
    if (accessories.length >= 18) continue;
    accessories.push(p);
  } else {
    if (core.length >= 45) continue;
    core.push(p);
  }
  catCount[cat] = (catCount[cat] || 0) + 1;
}

const selectedIds = new Set([...heroes, ...core, ...accessories].map((p) => p.id));
const longtailKeep = enriched.filter((p) =>
  !selectedIds.has(p.id) && p.status === 'active' && p.us_stock > 0 && p.blocking_gates === 0 &&
  (p.species === 'cat' || p.species === 'both') && p.views_90d > 0)
  .sort((a, b) => b.views_90d - a.views_90d)
  .slice(0, 20);
const longtailIds = new Set(longtailKeep.map((p) => p.id));

const blockedUntilFixed = enriched.filter((p) =>
  (p.species === 'cat' || p.species === 'both') && p.status === 'active' &&
  !selectedIds.has(p.id) && !longtailIds.has(p.id) && p.blocking_gates > 0 && p.blocking_gates <= 2 && p.score_total >= 60)
  .sort((a, b) => b.score_total - a.score_total);
const blockedIds = new Set(blockedUntilFixed.map((p) => p.id));

const retire = enriched.filter((p) => !selectedIds.has(p.id) && !longtailIds.has(p.id) && !blockedIds.has(p.id));

/* ---------- 4. Bundles (fulfilment safety = same supplier + both US warehouse verified) ---------- */

const pool = [...heroes, ...core, ...accessories];
const findBy = (re, exclude = []) => pool.find((p) => re.test(p.title.toLowerCase()) && !exclude.includes(p.id));
const bundleSpecs = [
  ['Complete Litter Station', /litter/, /mat|scoop|liner|deodor/],
  ['Litter Box + Odour Control', /litter box|enclosed/, /deodor|filter|charcoal|spray|mat/],
  ['Vertical Territory Starter', /tower|tree|condo/, /scratch/],
  ['Scratch-Free Living Room', /scratch/, /toy/],
  ['Cosy Corner', /bed|cave|hammock/, /blanket|toy|mat/],
  ['Indoor Enrichment Pack', /toy/, /tunnel|ball|wand|wheel/],
  ['Feeding Corner', /bowl|feeder|fountain/, /mat|bowl/],
  ['New Kitten Home Set', /litter box/, /bed|toy/],
  ['Grooming & Shedding Kit', /groom|brush/, /comb|glove|toy/],
  ['Small Apartment Cat Set', /stair|step|shelf|house/, /bed|scratch/],
];
const bundles = [];
for (const [name, a, b] of bundleSpecs) {
  const p1 = findBy(a);
  const p2 = findBy(b, p1 ? [p1.id] : []);
  if (!p1 || !p2) continue;
  const sameSupplier = p1.supplier_name === p2.supplier_name;
  const bothUsVerified = p1.verified_us_warehouse && p2.verified_us_warehouse;
  const bothStocked = p1.us_stock > 0 && p2.us_stock > 0;
  const noConflict = !p1.stock_source_conflict && !p2.stock_source_conflict;
  const safe = sameSupplier && bothUsVerified && bothStocked && noConflict;
  bundles.push({
    name,
    items: [p1, p2].map((p) => ({ slug: p.slug, title: p.title, price: p.price, us_stock: p.us_stock, warehouse: p.warehouse, supplier: p.supplier_name })),
    combined_price: Number((p1.price + p2.price).toFixed(2)),
    status: safe ? 'FULFILMENT_SAFE' : 'CONCEPTUAL_DO_NOT_ACTIVATE',
    reason: safe
      ? 'same supplier, both US warehouses verified, both in stock — can ship together'
      : `not activatable: sameSupplier=${sameSupplier}, bothUsVerified=${bothUsVerified}, bothStocked=${bothStocked}, noStockConflict=${noConflict}`,
  });
}

/* ---------- 5. Consistency checks ---------- */

const checks = [];
const fail = (name, offenders, detail) => checks.push({ check: name, pass: offenders.length === 0, offenders: offenders.slice(0, 10), count: offenders.length, detail });

fail('hero_count_is_exactly_5', heroes.length === 5 ? [] : [`got ${heroes.length}`], 'exactly five hero products');
fail('hero_has_us_stock', heroes.filter((h) => h.us_stock <= 0).map((h) => h.slug), 'no sold-out-only hero');
fail('hero_supplier_not_discontinued', heroes.filter((h) => String(h.supplier_status).toLowerCase() === 'discontinued' || h.supplier_sync_status === 'discontinued').map((h) => h.slug), 'no discontinued hero');
fail('hero_margin_at_least_35', heroes.filter((h) => (h.margin_pct ?? 0) < 35).map((h) => `${h.slug} (${h.margin_pct}%)`), 'hero margin floor');
fail('selected_have_variant_identity', pool.filter((p) => p.variant_count > 0 && p.cj_variant_ids.length === 0).map((p) => p.slug), 'every multi-variant product has usable variant ids');
fail('selected_have_supplier_mapping', pool.filter((p) => !p.cj_product_id).map((p) => p.slug), 'every selected product maps to a supplier product');
fail('no_shipping_promise_asserted', pool.filter((p) => p.shipping_days_on_record && p.delivery_confidence === 'none').map((p) => p.slug), 'unknown shipping truth is never presented as fact');
fail('assortment_size_45_to_60', pool.length >= 45 && pool.length <= 60 ? [] : [`got ${pool.length}`], 'visible range between 45 and 60 products');
fail('no_selected_product_is_confirmed_duplicate', pool.filter((p) => p.duplicate_risk === 'confirmed' || retireFromDupes.has(p.id)).map((p) => p.slug), 'duplicate-free range');
fail('selected_have_imagery', pool.filter((p) => p.image_count === 0).map((p) => p.slug), 'every selected product has imagery');

/* ---------- output ---------- */

const brief = (p, role) => ({
  role,
  slug: p.slug,
  title: p.title,
  category: p.category,
  score: p.score_total,
  price: p.price,
  margin_pct: p.margin_pct,
  supplier: p.supplier_name,
  supplier_status: p.supplier_status || p.supplier_sync_status,
  warehouse: p.warehouse,
  us_stock: p.us_stock,
  effective_stock: p.effective_stock,
  delivery_confidence: p.delivery_confidence,
  delivery_evidence: p.delivery_statement,
  shipping_days_on_record: p.shipping_days_on_record,
  stock_source_conflict: p.stock_source_conflict,
  inventory_sync_age_days: p.inventory_sync_age_days,
  problem_solved: PROBLEM(p),
  duplicate_status: p.duplicate_risk,
  visual_ugc: `${p.image_count} images, ugc score ${p.s_ugc}/7`,
  return_logistics_risk: `${5 - p.s_return_risk}/5 risk (weight ${p.weight ?? 'unknown'})`,
  bundle_role: p.s_bundle === 5 ? 'bundle-anchor or add-on' : 'standalone',
  blocker: p.hard_gates.split('|').filter((g) => g && g !== 'UNUSABLE_SHIPPING_PROMISE').join(', ') || null,
});

const mix = {};
for (const p of pool) mix[p.category || 'Other'] = (mix[p.category || 'Other'] || 0) + 1;

const result = {
  generated_at: new Date().toISOString(),
  mode: 'PHASE_1_PROPOSAL_NON_DESTRUCTIVE',
  assortment_size: pool.length,
  category_mix: mix,
  EXACT_5_HEROES: heroes.map((p) => brief(p, 'HERO')),
  CORE_RANGE: core.map((p) => brief(p, 'CORE')),
  ACCESSORIES: accessories.map((p) => brief(p, 'ACCESSORY')),
  LONGTAIL_KEEP: longtailKeep.map((p) => brief(p, 'LONGTAIL')),
  BLOCKED_UNTIL_FIXED: blockedUntilFixed.map((p) => ({ ...brief(p, 'BLOCKED'), gates: p.hard_gates })),
  RETIRE_CANDIDATES_COUNT: retire.length,
  RETIRE_CANDIDATES: retire.map((p) => ({ slug: p.slug, title: p.title, species: p.species, score: p.score_total, us_stock: p.us_stock, gates: p.hard_gates })),
  DUPLICATE_RESOLUTION: duplicateResolution,
  BUNDLE_PROPOSALS: bundles,
  CONSISTENCY_CHECKS: checks,
};

fs.writeFileSync(path.join(OUT, 'phase1-proposal.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  assortment_size: result.assortment_size,
  heroes: result.EXACT_5_HEROES.map((h) => `${h.score} ${h.category} | ${h.title.slice(0, 50)} | $${h.price} m${h.margin_pct} us${h.us_stock} ${h.delivery_confidence}`),
  core: core.length, accessories: accessories.length, longtail: longtailKeep.length,
  blocked: blockedUntilFixed.length, retire: retire.length,
  clusters: duplicateResolution.length,
  bundles: bundles.map((b) => `${b.status} | ${b.name}`),
  mix,
  checks: checks.map((c) => `${c.pass ? 'PASS' : 'FAIL'} ${c.check}${c.pass ? '' : ' -> ' + JSON.stringify(c.offenders)}`),
}, null, 2));
