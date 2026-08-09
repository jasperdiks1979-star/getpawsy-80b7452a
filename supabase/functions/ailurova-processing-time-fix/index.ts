// AILUROVA — surgical processing/delivery wording correction.
// Scope: customer-facing copy only (theme liquid/locales, pages, product description).
// Forbidden: prices, inventory, media, shipping profiles, markets, payments, design.
import { corsHeaders } from '../_shared/cors.ts';
import { shopifyAdminFetch } from '../_shared/shopify-token-provider.ts';

const PRODUCT_GID = 'gid://shopify/Product/15889810194764';

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

const SUPPORT = /support|respond|response|reply|email|inquir|contact|question/i;
const PROC = /process|dispatch|ship(?!ping cost)|order|handling|fulfil/i;
const DASH = '[–—-]';

function fixLine(line: string): string {
  let out = line;
  // 1) processing time 1-2 -> 1-3 (never in support-response context)
  const has12 = new RegExp(`1\\s*${DASH}\\s*2 business day`, 'i').test(out);
  if (has12 && !SUPPORT.test(out) && PROC.test(out)) {
    out = out.replace(new RegExp(`1\\s*${DASH}\\s*2( business day)`, 'gi'), '1–3$1');
  }
  // 2) delivery 5-10 must say "after dispatch"
  out = out.replace(
    new RegExp(`5\\s*${DASH}\\s*10 business days(?!\\s*(after dispatch|after your order))`, 'gi'),
    '5–10 business days after dispatch',
  );
  return out;
}

function scan(name: string, content: string) {
  const hits: Array<{ line: number; text: string; fixed: string }> = [];
  content.split('\n').forEach((l, i) => {
    if (!new RegExp(`(1\\s*${DASH}\\s*2|5\\s*${DASH}\\s*10)\\s*business day`, 'i').test(l)) return;
    const f = fixLine(l);
    hits.push({ line: i + 1, text: l.trim().slice(0, 300), fixed: f.trim().slice(0, 300) });
  });
  return hits.length ? { target: name, hits, changed: hits.some((h) => h.text !== h.fixed) } : null;
}

const apply = (c: string) => c.split('\n').map(fixLine).join('\n');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const mode = String(body.mode ?? 'audit');
    const theme = await liveTheme();

    const names = (await themeFilenames(theme.id)).filter((n) =>
      (n.startsWith('sections/') || n.startsWith('templates/') || n.startsWith('snippets/') ||
        n.startsWith('layout/') || n.startsWith('blocks/') || n.startsWith('locales/') ||
        n === 'config/settings_data.json') && !n.includes('backup'));
    const files = await readFiles(theme.id, names);
    const pages = (await gql<any>(`{ pages(first:50){ nodes{ id handle title body } } }`)).pages.nodes;
    const product = (await gql<any>(`query($id:ID!){ product(id:$id){ id status descriptionHtml
      variants(first:5){ nodes{ price compareAtPrice inventoryQuantity availableForSale } }
      media(first:30){ nodes{ id } } } }`, { id: PRODUCT_GID })).product;

    const findings = [
      ...Object.entries(files).map(([n, c]) => scan(n, c)),
      ...pages.map((p: any) => scan(`page:${p.handle}`, p.body ?? '')),
      scan('product:descriptionHtml', product.descriptionHtml ?? ''),
    ].filter(Boolean);

    if (mode !== 'apply') {
      return json({ theme: { id: theme.id, name: theme.name }, findings, product: {
        status: product.status, variants: product.variants.nodes, mediaCount: product.media.nodes.length } });
    }

    const mutations: any[] = [];

    const themePatch: Record<string, string> = {};
    for (const [n, c] of Object.entries(files)) { const f = apply(c); if (f !== c) themePatch[n] = f; }
    if (Object.keys(themePatch).length) {
      mutations.push({ type: 'themeFilesUpsert', files: Object.keys(themePatch), res: await writeFiles(theme.id, themePatch) });
    }

    for (const p of pages) {
      const f = apply(p.body ?? '');
      if (f === (p.body ?? '')) continue;
      const r = await gql<any>(`mutation($id:ID!,$page:PageUpdateInput!){ pageUpdate(id:$id, page:$page){ page{ handle } userErrors{ field message } } }`,
        { id: p.id, page: { body: f } });
      mutations.push({ type: 'pageUpdate', handle: p.handle, userErrors: r.pageUpdate.userErrors });
    }

    const pd = apply(product.descriptionHtml ?? '');
    if (pd !== (product.descriptionHtml ?? '')) {
      const r = await gql<any>(`mutation($i:ProductInput!){ productUpdate(input:$i){ product{ id } userErrors{ field message } } }`,
        { i: { id: PRODUCT_GID, descriptionHtml: pd } });
      mutations.push({ type: 'productUpdate.descriptionHtml', userErrors: r.productUpdate.userErrors });
    }

    return json({ theme: theme.name, mutations, findingsBefore: findings });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
