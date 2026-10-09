// Offline catalog truth audit. Inputs: a catalog snapshot JSON array (id, slug,
// name, price, stock, category, variants, description) and the live Merchant
// feed XML. No network, no DB. Usage:
//   bunx tsx scripts/audit-catalog-truth.ts <catalog.json> <feed.xml> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { listingPrice } from '../src/lib/listingPrice';
import { variantStockOf } from '../src/lib/variantStock';

type Row = { id: string; slug: string; name: string; price: number; stock: number | null; category: string | null; variants: unknown; description: string | null };
const [catPath, feedPath, outPath] = process.argv.slice(2);
const rows: Row[] = JSON.parse(readFileSync(catPath, 'utf8'));
const feed = readFileSync(feedPath, 'utf8');

const feedPrice = new Map<string, number>();
for (const m of feed.matchAll(/<item>[\s\S]*?<g:id>([^<]+)<\/g:id>[\s\S]*?<g:price>([\d.]+) USD<\/g:price>/g)) {
  feedPrice.set(m[1].trim(), Number(m[2]));
}

// Template phrases the old name/category generators injected.
const TEMPLATE_PHRASES = [
  'comfortable resting surface', 'quick-drying', 'non-slip backing', 'dishwasher safe',
  'meets most airline', 'durable, pet-safe materials', 'reduces shedding',
];
const LOGISTICS = /\b(\d+)\s*[–-]\s*(\d+)\s*(business\s+)?days?\b/gi;

const products = rows.map((r) => {
  const lp = listingPrice(Number(r.price), r.variants);
  const vars = Array.isArray(r.variants) ? r.variants : [];
  const unpurchasable = vars.filter((v) => { const s = variantStockOf(v); return s !== null && s <= 0; }).length;
  const fp = feedPrice.get(r.id);
  const desc = (r.description || '').toLowerCase();
  const text = TEMPLATE_PHRASES.filter((p) => desc.includes(p));
  const logistics = [...(r.description || '').matchAll(LOGISTICS)].map((m) => m[0])
    .filter((s) => !/^5\s*[–-]\s*10/.test(s) && !/^1\s*[–-]\s*2/.test(s));
  return {
    id: r.id, slug: r.slug,
    base_price: Number(r.price),
    effective_price: lp.price, effective_min: lp.min, effective_max: lp.max, is_range: lp.isRange,
    variant_count: vars.length, unpurchasable_variants_known: unpurchasable,
    live_feed_price: fp ?? null,
    in_live_feed: fp !== undefined,
    live_feed_mismatch: fp !== undefined && Math.abs(fp - lp.price) >= 0.005,
    expected_after_fix: fp !== undefined ? 'feed+schema+PDP = effective_price' : 'not in feed',
    stored_description_template_phrases: text,
    stored_description_logistics_claims: logistics,
    evidence_status: vars.length === 0 ? 'no_variant_data' : 'variant_data_present',
  };
});

const summary = {
  generated_at: new Date().toISOString(),
  source: 'bounded read-only snapshot of products_public (active, non-duplicate, slug, price>0) + live merchant-feed.xml',
  examined: products.length,
  in_live_feed: products.filter((p) => p.in_live_feed).length,
  live_feed_price_mismatches_fixed_by_code: products.filter((p) => p.live_feed_mismatch).length,
  price_ranges: products.filter((p) => p.is_range).length,
  stored_description_template_phrase_products: products.filter((p) => p.stored_description_template_phrases.length).length,
  stored_description_divergent_logistics_products: products.filter((p) => p.stored_description_logistics_claims.length).length,
};
writeFileSync(outPath, JSON.stringify({ summary, products }, null, 2));
console.log(JSON.stringify(summary, null, 2));
