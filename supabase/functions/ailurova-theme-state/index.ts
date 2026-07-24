import { corsHeaders } from "../_shared/cors.ts";
import { shopifyAdminFetch } from "../_shared/shopify-token-provider.ts";

const TARGET = "gid://shopify/OnlineStoreTheme/202525999436";
const LIVE = "gid://shopify/OnlineStoreTheme/201779872076";

const Q = `query { themes(first:50){ nodes { id name role updatedAt processing } } }`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const r = await shopifyAdminFetch<any>(Q, {});
  const themes = r.data?.themes?.nodes ?? [];
  const target = themes.find((t:any)=>t.id===TARGET);
  const live = themes.find((t:any)=>t.id===LIVE);
  return new Response(JSON.stringify({
    target, live, distinct: target?.id !== live?.id,
    all_roles: themes.map((t:any)=>({id:t.id,name:t.name,role:t.role,updatedAt:t.updatedAt})),
    errors: r.errors ?? null,
  }, null, 2), { headers: { ...corsHeaders, "content-type":"application/json" }});
});
