// Ailurova storefront finalize — navigation, media order, footer/legal scan, Stage 5 verify.
// Strictly scoped: menus + product media ORDER only. No pricing, inventory, markets,
// shipping profiles, payments, checkout logic, Merchant Center or Ads mutations.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { shopifyAdminFetch } from '../_shared/shopify-token-provider.ts';

const PRODUCT_GID = 'gid://shopify/Product/15889810194764';
const PDP_PATH = '/products/ailurova-xl-stainless-steel-enclosed-cat-litter-box-for-large-cats';
const BASE = 'https://www.ailurova.com';
const NEW_EMAIL = 'support@ailurova.com';
const LEGACY_EMAIL = 'support@getpawsy.pet';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function gql<T>(q: string, v: Record<string, unknown> = {}) {
  const r = await shopifyAdminFetch<T>(q, v);
  if (r.errors) throw new Error(JSON.stringify(r.errors));
  return r.data as T;
}

/* ---------------- read helpers ---------------- */

async function readMenus() {
  const d = await gql<any>(`{
    menus(first: 20) {
      nodes { id handle title
        items { id title type url resourceId
          items { id title type url resourceId } } }
    }
  }`);
  return d.menus.nodes;
}

async function readMedia() {
  const d = await gql<any>(`query($id:ID!){
    product(id:$id){
      id title handle onlineStoreUrl
      media(first:30){ nodes{ id alt ... on MediaImage { image { url width height } } } }
    }
  }`, { id: PRODUCT_GID });
  return d.product;
}

async function readProductState() {
  const d = await gql<any>(`query($id:ID!){
    product(id:$id){
      id title status handle descriptionHtml
      seo{ title description }
      totalInventory
      variants(first:5){ nodes{ id title sku price compareAtPrice inventoryQuantity availableForSale } }
    }
  }`, { id: PRODUCT_GID });
  return d.product;
}

/* ---------------- live page scanning ---------------- */

const FORBIDDEN: Array<[string, RegExp]> = [
  ['legacy_email', /support@getpawsy\.pet/i],
  ['getpawsy_brand', /getpawsy/i],
  ['assortiment', /assortiment/i],
  ['aggregate_rating', /aggregateRating/i],
  ['review_schema', /"@type"\s*:\s*"Review"/i],
  ['removable_step', /removable\s+step/i],
  ['odor_proof', /odou?r[- ]proof|eliminates?\s+odou?rs?|anti-?bacterial|stain[- ]proof|resists?\s+(stains|odou?r)|rust[- ]proof|non-?stick|medical[- ]grade/i],
  ['cat_weight_claim', /cats?\s+(under|up to)\s+\d+\s*(lb|lbs|kg|pounds)/i],
  ['bad_ship_wording', /ships?\s+in\s+1[–-]3\s+business\s+days/i],
];

async function scanPage(path: string) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36' },
    });
    const html = await res.text();
    const hits: string[] = [];
    for (const [name, re] of FORBIDDEN) if (re.test(html)) hits.push(name);
    return {
      url,
      status: res.status,
      violations: hits,
      hasNewEmail: html.includes(NEW_EMAIL),
      hasSkidzo: /Skidzo/i.test(html),
      hasProcessingWording: /Processing time:\s*1[–-]3 business days/i.test(html),
      hasDeliveryWording: /5[–-]10 business[- ]day/i.test(html),
      has99: /\$?99[.,]00/.test(html),
      has119: /\$?119[.,]00/.test(html),
      soldOut: /sold out|uitverkocht/i.test(html),
    };
  } catch (e) {
    return { url, status: 0, error: String(e), violations: ['fetch_failed'] };
  }
}

/* ---------------- nav mutation ---------------- */

async function applyNav(dryRun: boolean) {
  const menus = await readMenus();
  const main = menus.find((m: any) => m.handle === 'main-menu') ?? menus[0];
  const snapshot = JSON.parse(JSON.stringify(main));

  const items = [
    { title: 'Home', type: 'FRONTPAGE', url: `${BASE}/` },
    { title: 'Shop', type: 'HTTP', url: `${BASE}${PDP_PATH}` },
    { title: 'About', type: 'HTTP', url: `${BASE}/pages/about` },
    { title: 'FAQ', type: 'HTTP', url: `${BASE}/pages/faq` },
    { title: 'Contact', type: 'HTTP', url: `${BASE}/pages/contact` },
  ];

  if (dryRun) return { snapshot, planned: items, applied: false };

  const d = await gql<any>(`mutation($id:ID!,$title:String!,$handle:String!,$items:[MenuItemUpdateInput!]!){
    menuUpdate(id:$id,title:$title,handle:$handle,items:$items){
      menu{ id handle items{ id title type url } }
      userErrors{ field message }
    }
  }`, { id: main.id, title: main.title, handle: main.handle, items });

  return { snapshot, applied: true, result: d.menuUpdate };
}

/* ---------------- media reorder ---------------- */

async function reorderMedia(firstMediaId: string, dryRun: boolean) {
  const p = await readMedia();
  const ids: string[] = p.media.nodes.map((n: any) => n.id);
  const snapshot = ids;
  if (!ids.includes(firstMediaId)) throw new Error('firstMediaId not on product');
  if (ids[0] === firstMediaId) return { snapshot, applied: false, reason: 'already_first' };
  const moves = [{ id: firstMediaId, newPosition: '0' }];
  if (dryRun) return { snapshot, planned: moves, applied: false };
  const d = await gql<any>(`mutation($id:ID!,$moves:[MoveInput!]!){
    productReorderMedia(id:$id,moves:$moves){ job{ id } mediaUserErrors{ field message } }
  }`, { id: PRODUCT_GID, moves });
  return { snapshot, applied: true, result: d.productReorderMedia };
}

/* ---------------- handler ---------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const mode = String(body.mode ?? 'audit');

    if (mode === 'audit') {
      const [menus, media, product] = await Promise.all([readMenus(), readMedia(), readProductState()]);
      return json({ mode, menus, media: media.media.nodes, product });
    }

    if (mode === 'apply-nav') return json({ mode, ...(await applyNav(!!body.dryRun)) });

    if (mode === 'reorder-media')
      return json({ mode, ...(await reorderMedia(String(body.firstMediaId), !!body.dryRun)) });

    if (mode === 'verify') {
      const [product, media, menus] = await Promise.all([readProductState(), readMedia(), readMenus()]);
      const paths = [PDP_PATH, '/', '/pages/about', '/pages/faq', '/pages/contact',
        '/policies/shipping-policy', '/policies/refund-policy', '/policies/terms-of-service'];
      const pages = [];
      for (const p of paths) pages.push(await scanPage(p));
      const v = product.variants.nodes[0];
      const menuTitles = (menus.find((m: any) => m.handle === 'main-menu') ?? menus[0])
        .items.map((i: any) => i.title);
      return json({
        mode,
        product: {
          title: product.title, status: product.status, descLen: product.descriptionHtml?.length ?? 0,
          seo: product.seo, price: v.price, compareAtPrice: v.compareAtPrice,
          inventoryQuantity: v.inventoryQuantity, availableForSale: v.availableForSale,
        },
        firstMedia: { id: media.media.nodes[0]?.id, alt: media.media.nodes[0]?.alt },
        altTexts: media.media.nodes.map((n: any) => n.alt),
        menuTitles,
        pages,
        totalViolations: pages.flatMap((p: any) => p.violations ?? []),
      });
    }

    return json({ error: `unknown mode ${mode}` }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
