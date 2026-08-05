// AILUROVA STOREFRONT REBUILD — scoped, snapshot-first, rollback-safe.
// modes: "snapshot" (read-only) | "apply" | "verify"
// Scope is hard-limited to: product copy/SEO/media-alt, About+FAQ pages,
// support-email replacement in theme files & pages. Nothing else is touched.
import { getShopifyConfig, shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import { corsHeaders } from "../_shared/cors.ts";

const PRODUCT_GID = "gid://shopify/Product/15889810194764";
const OLD_EMAIL = "support@getpawsy.pet";
const NEW_EMAIL = "support@ailurova.com";

async function gql<T>(q: string, v: Record<string, unknown> = {}) {
  const r = await shopifyAdminFetch<T>(q, v);
  if (r.errors) throw new Error(`GraphQL error: ${JSON.stringify(r.errors).slice(0, 800)}`);
  return r.data as T;
}

const PRODUCT_Q = `query($id:ID!){ product(id:$id){
  id title handle status vendor descriptionHtml
  seo{title description}
  onlineStoreUrl
  variants(first:5){nodes{id title sku price compareAtPrice inventoryQuantity availableForSale}}
  media(first:25){nodes{ id alt mediaContentType ... on MediaImage { image{url width height} } }}
} }`;

const PAGES_Q = `query{ pages(first:50){nodes{id title handle bodySummary body }} }`;

const THEMES_Q = `query{ themes(first:20, roles:[MAIN]){nodes{id name role}} }`;

async function themeFiles(themeId: string, filenames?: string[]) {
  const q = `query($id:ID!,$f:[String!]){ theme(id:$id){ id name files(first:250, filenames:$f){ nodes{ filename body{ ... on OnlineStoreThemeFileBodyText { content } } } } } }`;
  return await gql<{ theme: { id: string; name: string; files: { nodes: { filename: string; body: { content?: string } }[] } } }>(q, { id: themeId, f: filenames ?? null });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode = body.mode ?? "snapshot";
    const { domain } = getShopifyConfig();

    const product = (await gql<{ product: any }>(PRODUCT_Q, { id: PRODUCT_GID })).product;
    const pages = (await gql<{ pages: { nodes: any[] } }>(PAGES_Q)).pages.nodes;
    const theme = (await gql<{ themes: { nodes: any[] } }>(THEMES_Q)).themes.nodes[0];

    // scan main theme for the legacy email + shipping wording
    const tf = await themeFiles(theme.id);
    const hits = tf.theme.files.nodes
      .filter((f) => (f.body?.content ?? "").includes(OLD_EMAIL) || /1[–-]3 business days/i.test(f.body?.content ?? ""))
      .map((f) => ({
        filename: f.filename,
        emailHits: ((f.body?.content ?? "").match(new RegExp(OLD_EMAIL, "g")) || []).length,
        shipHits: ((f.body?.content ?? "").match(/Ships? in 1[–-]3 business days/gi) || []).length,
      }));

    const pageHits = pages
      .filter((p) => (p.body ?? "").includes(OLD_EMAIL))
      .map((p) => ({ handle: p.handle, id: p.id }));

    const snapshot = {
      shop: domain,
      theme: { id: theme.id, name: theme.name, fileCount: tf.theme.files.nodes.length },
      product: {
        id: product.id, title: product.title, handle: product.handle, status: product.status,
        vendor: product.vendor, descriptionHtmlLength: (product.descriptionHtml ?? "").length,
        descriptionHtml: product.descriptionHtml, seo: product.seo,
        variants: product.variants.nodes,
        media: product.media.nodes.map((m: any, i: number) => ({ i, id: m.id, alt: m.alt, url: m.image?.url })),
      },
      pages: pages.map((p) => ({ handle: p.handle, id: p.id, title: p.title })),
      legacyEmailInThemeFiles: hits,
      legacyEmailInPages: pageHits,
    };

    if (mode === "snapshot") {
      return new Response(JSON.stringify({ ok: true, mode, snapshot }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: `mode ${mode} not implemented in this build` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
