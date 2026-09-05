// READ-ONLY theme file inventory for the live Ailurova theme. No mutations.
import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const THEME = "gid://shopify/OnlineStoreTheme/202525999436";
const Q = `query T($id: ID!, $f: [String!]) {
  theme(id: $id) {
    id name role
    files(first: 250, filenames: $f) {
      nodes { filename size body { ... on OnlineStoreThemeFileBodyText { content } } }
    }
  }
}`;
const Q_LIST = `query L($id: ID!, $after: String) {
  theme(id: $id) { files(first: 250, after: $after) { pageInfo { hasNextPage endCursor } nodes { filename size } } }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const __gate = await requireInternalOrAdmin(req);
  if (__gate) return __gate;
  const url = new URL(req.url);
  let want: string[] = [];
  if (req.method === "POST") { try { want = (await req.json()).filenames ?? []; } catch { /*noop*/ } }
  const qs = url.searchParams.get("filenames");
  if (qs) want = qs.split(",");
  if (want.length) {
    const r = await shopifyAdminFetch<any>(Q, { id: THEME, f: want });
    return new Response(JSON.stringify(r, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
  }
  const all: unknown[] = [];
  let after: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r: any = await shopifyAdminFetch<any>(Q_LIST, { id: THEME, after });
    const f = r.data?.theme?.files;
    if (!f) return new Response(JSON.stringify(r, null, 2), { headers: { ...corsHeaders, "content-type": "application/json" } });
    all.push(...f.nodes);
    if (!f.pageInfo.hasNextPage) break;
    after = f.pageInfo.endCursor;
  }
  return new Response(JSON.stringify({ count: all.length, files: all }, null, 2), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
