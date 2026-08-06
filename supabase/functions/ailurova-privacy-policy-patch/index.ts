// Ailurova — Privacy Policy ONLY minimal branding patch.
// mode=audit -> read shop privacy policy + any privacy page, report obsolete brand hits.
// mode=apply -> replace obsolete GetPawsy branding/contact with Ailurova / Skidzo / support@ailurova.com.
// No other policy, product, theme, SEO, menu, checkout or shipping object is touched.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { shopifyAdminFetch } from '../_shared/shopify-token-provider.ts';

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

const RULES: Array<[RegExp, string]> = [
  [/support@getpawsy\.pet/gi, 'support@ailurova.com'],
  [/(?:https?:\/\/)?(?:www\.)?getpawsy\.pet/gi, 'ailurova.com'],
  [/GetPawsy\s+LLC/gi, 'Skidzo'],
  [/GetPawsy/gi, 'Ailurova'],
  [/getpawsy/gi, 'ailurova'],
];

function patch(body: string) {
  let out = body;
  let count = 0;
  for (const [re, rep] of RULES) {
    out = out.replace(re, () => {
      count++;
      return rep;
    });
  }
  return { out, count };
}

function hits(body: string) {
  return (body.match(/getpawsy/gi) || []).length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') ?? 'audit';

    const shop = await gql<any>(`query {
      shop { id privacyPolicy { id body url } }
    }`);
    const policy = shop.shop.privacyPolicy;

    const pagesData = await gql<any>(`query {
      pages(first: 50, query: "privacy") { nodes { id handle title body } }
    }`);
    const pages = (pagesData.pages?.nodes ?? []).filter((p: any) =>
      /privacy/i.test(p.handle) || /privacy/i.test(p.title),
    );

    const report: any = {
      mode,
      shopPolicy: policy
        ? { id: policy.id, url: policy.url, obsoleteHits: hits(policy.body || ''), length: (policy.body || '').length }
        : null,
      pages: pages.map((p: any) => ({ id: p.id, handle: p.handle, obsoleteHits: hits(p.body || '') })),
      changes: [] as any[],
    };

    if (mode !== 'apply') return json(report);

    // 1. Shop legal privacy policy
    if (policy && hits(policy.body || '') > 0) {
      const { out, count } = patch(policy.body);
      const r = await gql<any>(
        `mutation($p: ShopPolicyInput!) {
          shopPolicyUpdate(shopPolicy: $p) {
            shopPolicy { id url }
            userErrors { field message }
          }
        }`,
        { p: { id: policy.id, body: out } },
      );
      report.changes.push({
        target: 'shop.privacyPolicy.body',
        replacements: count,
        userErrors: r.shopPolicyUpdate.userErrors,
      });
    }

    // 2. Online Store privacy page (if one exists)
    for (const p of pages) {
      if (hits(p.body || '') === 0) continue;
      const { out, count } = patch(p.body);
      const r = await gql<any>(
        `mutation($id: ID!, $page: PageUpdateInput!) {
          pageUpdate(id: $id, page: $page) {
            page { id handle }
            userErrors { field message }
          }
        }`,
        { id: p.id, page: { body: out } },
      );
      report.changes.push({
        target: `page:${p.handle}.body`,
        replacements: count,
        userErrors: r.pageUpdate.userErrors,
      });
    }

    // verify
    const after = await gql<any>(`query { shop { privacyPolicy { body url } } }`);
    report.verify = {
      shopPolicyObsoleteHits: hits(after.shop.privacyPolicy?.body || ''),
      supportEmailPresent: /support@ailurova\.com/i.test(after.shop.privacyPolicy?.body || ''),
    };
    return json(report);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
