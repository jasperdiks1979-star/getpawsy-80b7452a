// AILUROVA — FINAL PRODUCTION STOREFRONT COMPLETION
// Strictly scoped mutations: product descriptionHtml + SEO, product media attach/alt,
// theme liquid/locale copy, pages (about/faq/contact) copy, menus.
// FORBIDDEN: price, compare-at, inventory, status, markets, payments, shipping profiles,
// taxes, domains, ads, merchant center, unrelated products.
import { corsHeaders } from '../_shared/cors.ts';
import { shopifyAdminFetch } from '../_shared/shopify-token-provider.ts';
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const PRODUCT_GID = 'gid://shopify/Product/15889810194764';
const BASE = 'https://www.ailurova.com';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), {
    status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function gql<T>(q: string, v: Record<string, unknown> = {}) {
  const r = await shopifyAdminFetch<T>(q, v);
  if (r.errors) throw new Error(JSON.stringify(r.errors));
  return r.data as T;
}

async function liveTheme() {
  const d = await gql<any>(`{ themes(first:20){ nodes{ id name role } } }`);
  return d.themes.nodes.find((t: any) => t.role === 'MAIN');
}

async function themeFilenames(themeId: string) {
  const out: string[] = [];
  let after: string | null = null;
  for (let i = 0; i < 10; i++) {
    const d: any = await gql<any>(
      `query($id:ID!,$after:String){ theme(id:$id){ files(first:250, after:$after){ nodes{ filename } pageInfo{ hasNextPage endCursor } } } }`,
      { id: themeId, after });
    out.push(...d.theme.files.nodes.map((n: any) => n.filename));
    if (!d.theme.files.pageInfo.hasNextPage) break;
    after = d.theme.files.pageInfo.endCursor;
  }
  return out;
}

async function readFiles(themeId: string, names: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < names.length; i += 25) {
    const chunk = names.slice(i, i + 25);
    const d = await gql<any>(
      `query($id:ID!,$f:[String!]){ theme(id:$id){ files(filenames:$f, first:25){ nodes{ filename body{ ... on OnlineStoreThemeFileBodyText { content } } } } } }`,
      { id: themeId, f: chunk });
    for (const n of d.theme?.files?.nodes ?? []) out[n.filename] = n.body?.content ?? '';
  }
  return out;
}

async function writeFiles(themeId: string, files: Record<string, string>) {
  const d = await gql<any>(
    `mutation($id:ID!,$files:[OnlineStoreThemeFilesUpsertFileInput!]!){
      themeFilesUpsert(themeId:$id, files:$files){ upsertedThemeFiles{ filename } userErrors{ filename code message } } }`,
    { id: themeId, files: Object.entries(files).map(([filename, content]) => ({ filename, body: { type: 'TEXT', value: content } })) });
  return d.themeFilesUpsert;
}

const KEYWORDS = [
  /removable/i, /fulfil?lment partner/i, /getpawsy/i, /support@getpawsy/i,
  /assortiment/i, /leakproof/i, /non-?stick/i, /anti-?scratch/i, /15 ?lbs/i,
  /any time|24\/7/i, /Powered by Shopify/i,
];

function scanText(name: string, content: string) {
  const hits: Array<{ kw: string; line: number; text: string }> = [];
  content.split('\n').forEach((l, i) => {
    for (const re of KEYWORDS) if (re.test(l)) hits.push({ kw: re.source, line: i + 1, text: l.trim().slice(0, 240) });
  });
  return hits.length ? { file: name, hits } : null;
}

async function readProduct() {
  const d = await gql<any>(`query($id:ID!){ product(id:$id){
    id title handle status descriptionHtml seo{ title description }
    featuredMedia{ id }
    media(first:30){ nodes{ id alt ... on MediaImage { image{ url } } } }
    variants(first:5){ nodes{ id price compareAtPrice inventoryQuantity availableForSale } } } }`, { id: PRODUCT_GID });
  return d.product;
}

async function readPages() {
  const d = await gql<any>(`{ pages(first:30){ nodes{ id handle title body } } }`);
  return d.pages.nodes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const mode = String(body.mode ?? 'audit');
    const theme = await liveTheme();

    if (mode === 'audit') {
      const names = await themeFilenames(theme.id);
      const scanNames = names.filter((n) =>
        n.startsWith('sections/') || n.startsWith('templates/') || n.startsWith('snippets/') ||
        n.startsWith('layout/') || n.startsWith('blocks/') || n === 'locales/en.default.json' || n === 'config/settings_data.json');
      const files = await readFiles(theme.id, scanNames);
      const findings = Object.entries(files).map(([n, c]) => scanText(n, c)).filter(Boolean);
      const [product, pages] = await Promise.all([readProduct(), readPages()]);
      const pageFindings = pages.map((p: any) => scanText(`page:${p.handle}`, p.body ?? '')).filter(Boolean);
      return json({
        theme: { id: theme.id, name: theme.name },
        filenames: names,
        findings, pageFindings,
        product: { ...product, descriptionHtml: product.descriptionHtml },
        pages: pages.map((p: any) => ({ handle: p.handle, title: p.title, len: (p.body ?? '').length })),
      });
    }

    if (mode === 'read-files') {
      const files = await readFiles(theme.id, body.filenames as string[]);
      return json({ theme: theme.name, files });
    }

    if (mode === 'write-files') {
      const res = await writeFiles(theme.id, body.files as Record<string, string>);
      return json({ theme: theme.name, res });
    }

    if (mode === 'update-product') {
      const input: any = { id: PRODUCT_GID };
      if (body.descriptionHtml) input.descriptionHtml = body.descriptionHtml;
      if (body.seo) input.seo = body.seo;
      const d = await gql<any>(`mutation($i:ProductInput!){ productUpdate(input:$i){ product{ id } userErrors{ field message } } }`, { i: input });
      return json(d.productUpdate);
    }

    if (mode === 'attach-media') {
      const media = (body.media as Array<{ src: string; alt: string }>).map((m) => ({
        originalSource: m.src, alt: m.alt, mediaContentType: 'IMAGE',
      }));
      const d = await gql<any>(`mutation($id:ID!,$m:[CreateMediaInput!]!){
        productCreateMedia(productId:$id, media:$m){ media{ ... on MediaImage { id alt } } mediaUserErrors{ field message } } }`,
        { id: PRODUCT_GID, m: media });
      return json(d.productCreateMedia);
    }

    if (mode === 'set-alt') {
      const updates = (body.alts as Array<{ id: string; alt: string }>).map((a) => ({ id: a.id, alt: a.alt }));
      const d = await gql<any>(`mutation($id:ID!,$m:[UpdateMediaInput!]!){
        productUpdateMedia(productId:$id, media:$m){ media{ ... on MediaImage { id alt } } mediaUserErrors{ field message } } }`,
        { id: PRODUCT_GID, m: updates });
      return json(d.productUpdateMedia);
    }

    if (mode === 'update-page') {
      const d = await gql<any>(`mutation($id:ID!,$p:PageUpdateInput!){ pageUpdate(id:$id, page:$p){ page{ id handle } userErrors{ field message } } }`,
        { id: body.id, p: body.page });
      return json(d.pageUpdate);
    }

    if (mode === 'policies') {
      const d = await gql<any>(`{ shop{ name contactEmail } shopPolicies{ id type body url } }`).catch((e) => ({ error: String(e) } as any));
      return json(d);
    }

    if (mode === 'policy-update') {
      const d = await gql<any>(`mutation($p:ShopPolicyInput!){ shopPolicyUpdate(shopPolicy:$p){ shopPolicy{ id type } userErrors{ field message } } }`,
        { p: { id: body.id, body: body.body } });
      return json(d.shopPolicyUpdate);
    }

    if (mode === 'verify') {
      const paths: string[] = body.paths ?? ['/'];
      const out = [];
      for (const p of paths) {
        try {
          const r = await fetch(`${BASE}${p}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36' } });
          const html = await r.text();
          const bad: string[] = [];
          for (const [k, re] of [
            ['getpawsy', /getpawsy/i], ['legacy_email', /support@getpawsy\.pet/i], ['assortiment', /assortiment/i],
            ['fulfillment_partner', /fulfil?lment partner/i], ['removable', /removable/i],
            ['cat_weight', /cats?\s+(under|up to)\s*\d+\s*(lb|lbs|kg)/i], ['leakproof', /leakproof/i],
            ['aggregateRating', /aggregateRating/i], ['review_schema', /"@type"\s*:\s*"Review"/i],
          ] as Array<[string, RegExp]>) if (re.test(html)) bad.push(k);
          out.push({
            path: p, status: r.status, violations: bad,
            h1: (html.match(/<h1[^>]*>/gi) ?? []).length,
            hasSupport: html.includes('support@ailurova.com'),
            has99: /99\.00/.test(html), has119: /119\.00/.test(html),
            soldOut: /sold out/i.test(html),
            metaDesc: (html.match(/<meta name="description" content="([^"]{0,160})/i) ?? [])[1] ?? null,
            canonical: (html.match(/rel="canonical" href="([^"]+)"/i) ?? [])[1] ?? null,
          });
        } catch (e) { out.push({ path: p, error: String(e) }); }
      }
      return json({ verify: out });
    }

    return json({ error: `unknown mode ${mode}` }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
