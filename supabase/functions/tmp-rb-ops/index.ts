// TEMPORARY diagnostic/ops function for the Rolling Ball Pinterest campaign run.
// Deployed for a single operator-authorized run and deleted immediately after.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const GUARD = "858a9f18f5ce3081c6e71c7a3bb778d2";
const API = "https://api.pinterest.com/v5";
const CJ = "https://developers.cjdropshipping.com/api2.0/v1";
const AD_ACCOUNT = "549770199501";
const CATALOG = "4812802272679";
const FEED = "1550597640822";
const TAG = "2612820116727";
const ITEM_ID = "8720d049-8b7b-4492-a5e7-22c59df71a8d";
const PID = "1996402356062965762";
const VID = "1996402356792774657";
const SKU = "CJCT2630962";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function pin(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await r.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, ok: r.ok, body };
}

async function cjToken(sb: ReturnType<typeof createClient>): Promise<string> {
  const { data: cached } = await sb.from("cj_token_cache").select("access_token, token_expiry").eq("id", "singleton").maybeSingle();
  if (cached && new Date((cached as any).token_expiry).getTime() > Date.now()) return (cached as any).access_token;
  const res = await fetch(`${CJ}/authentication/getAccessToken`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: Deno.env.get("CJ_API_KEY") }),
  });
  const data = await res.json();
  if (!data?.result) throw new Error("cj auth failed");
  await sb.from("cj_token_cache").upsert({
    id: "singleton", access_token: data.data.accessToken,
    token_expiry: new Date(new Date(data.data.accessTokenExpiryDate).getTime() - 300000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return data.data.accessToken;
}

async function cjGet(path: string, token: string) {
  const r = await fetch(`${CJ}${path}`, { headers: { "CJ-Access-Token": token, "Content-Type": "application/json" } });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("guard") !== GUARD) return new Response("no", { status: 403 });
  const phase = url.searchParams.get("phase") ?? "preflight";
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: conn } = await sb.from("pinterest_connection").select("access_token").limit(1).maybeSingle();
  const token = (conn as any)?.access_token as string;
  const out: Record<string, unknown> = { phase };

  try {
    if (phase === "preflight") {
      out.catalog_item = await pin(
        `/catalogs/items?catalog_id=${CATALOG}&country=US&language=en&item_ids=${ITEM_ID}`, token);
      out.product_groups = await pin(`/catalogs/product_groups?catalog_id=${CATALOG}&page_size=250`, token);
      out.conversion_tag = await pin(`/ad_accounts/${AD_ACCOUNT}/conversion_tags/${TAG}`, token);
      out.ad_account = await pin(`/ad_accounts/${AD_ACCOUNT}`, token);
      // storefront
      const pdp = await fetch("https://getpawsy.pet/products/interactive-rolling-cat-ball", { redirect: "follow" });
      const html = await pdp.text();
      out.pdp = {
        status: pdp.status, final_url: pdp.url,
        canonical: html.match(/rel="canonical"[^>]*href="([^"]+)"/)?.[1] ?? null,
        has_price: html.includes("43.99"),
        sold_out: /sold\s*out|out of stock/i.test(html),
      };
      const { data: prod } = await sb.from("products")
        .select("id,name,slug,price,stock,is_active,image_url,cj_product_id,cj_variant_id,sku")
        .eq("id", ITEM_ID).maybeSingle();
      out.db_product = prod;
      // CJ live
      const t = await cjToken(sb);
      out.cj_product = await cjGet(`/product/query?pid=${PID}`, t);
      out.cj_stock = await cjGet(`/product/stock/queryByVid?vid=${VID}`, t);
      const fr = await fetch(`${CJ}/logistic/freightCalculate`, {
        method: "POST", headers: { "CJ-Access-Token": t, "Content-Type": "application/json" },
        body: JSON.stringify({ startCountryCode: "US", endCountryCode: "US", zip: "10001", products: [{ quantity: 1, vid: VID }] }),
      });
      out.cj_freight = { status: fr.status, body: await fr.json().catch(() => ({})) };
    }

    if (phase === "group") {
      const body = {
        catalog_type: "RETAIL",
        name: "GetPawsy First Sale — Interactive Rolling Cat Ball",
        filters: { any_of: [{ ITEM_ID: { query: [ITEM_ID], inclusion: true } }] },
        catalog_id: CATALOG,
      };
      out.create = await pin(`/catalogs/product_groups`, token, { method: "POST", body: JSON.stringify(body) });
    }

    if (phase === "group_check") {
      const gid = url.searchParams.get("gid")!;
      out.group = await pin(`/catalogs/product_groups/${gid}`, token);
      out.counts = await pin(`/catalogs/product_groups/${gid}/product_counts`, token);
    }

    if (phase === "create") {
      const gid = url.searchParams.get("gid")!;
      const camp = await pin(`/ad_accounts/${AD_ACCOUNT}/campaigns`, token, {
        method: "POST",
        body: JSON.stringify([{
          ad_account_id: AD_ACCOUNT,
          name: "GetPawsy | First Sale | US | Rolling Cat Ball | ATC",
          objective_type: "CATALOG_SALES",
          status: "PAUSED",
          daily_spend_cap: 5000000,
          is_campaign_budget_optimization: true,
        }]),
      });
      out.campaign = camp;
      const cid = (camp.body as any)?.items?.[0]?.data?.id;
      out.campaign_id = cid;
      if (!cid) return json(out);
      const ag = await pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups`, token, {
        method: "POST",
        body: JSON.stringify([{
          ad_account_id: AD_ACCOUNT,
          campaign_id: cid,
          name: "US | Rolling Cat Ball | ADD_TO_CART",
          status: "PAUSED",
          billable_event: "IMPRESSION",
          bid_strategy_type: "AUTOMATIC_BID",
          budget_type: "CBO_ADGROUP",
          optimization_goal_metadata: {
            conversion_tag_v3_goal_metadata: {
              attribution_windows: { click_window_days: 30, engagement_window_days: 30, view_window_days: 1 },
              conversion_event: "ADD_TO_CART",
              conversion_tag_id: TAG,
              is_roas_optimized: false,
              learning_mode_type: "NOT_ACTIVE",
            },
          },
          targeting_spec: { LOCATION: ["US"] },
          placement_group: "ALL",
          auto_targeting_enabled: true,
          feed_profile_id: FEED,
        }]),
      });
      out.ad_group = ag;
      const agid = (ag.body as any)?.items?.[0]?.data?.id;
      out.ad_group_id = agid;
      if (!agid) return json(out);
      out.promotion = await pin(`/ad_accounts/${AD_ACCOUNT}/product_groups/catalogs`, token, {
        method: "POST",
        body: JSON.stringify([{
          ad_group_id: agid,
          catalog_product_group_id: gid,
          creative_type: "SHOPPING",
          status: "PAUSED",
          customizable_cta_type: "SHOP_NOW",
          grid_click_type: "DIRECT_TO_DESTINATION",
          included_product_count: 1,
        }]),
      });
    }


    if (phase === "verify") {
      out.bubble_counts = await pin(`/catalogs/product_groups/4673049699886/product_counts`, token);
      out.all_counts = await pin(`/catalogs/product_groups/4673044297940/product_counts`, token);
      out.accordion_counts = await pin(`/catalogs/product_groups/4673049493396/product_counts`, token);
      out.item_v1 = await pin(`/catalogs/items?catalog_id=${CATALOG}&country=US&language=EN&item_ids=${ITEM_ID}`, token);
      out.item_v2 = await pin(`/catalogs/products/${ITEM_ID}`, token);
      out.feeds = await pin(`/catalogs/feeds?catalog_id=${CATALOG}`, token);
      out.processing = await pin(`/catalogs/feeds/${FEED}/processing_results?page_size=3`, token);
    }

    if (phase === "raw") {
      const path = url.searchParams.get("path")!;
      const method = url.searchParams.get("method") ?? "GET";
      const body = method === "GET" ? undefined : await req.text();
      out.result = await pin(path, token, { method, body });
    }
  } catch (e) {
    out.error = String((e as Error).message ?? e);
  }
  return json(out);
});

function json(o: unknown) {
  return new Response(JSON.stringify(o, null, 2), { headers: { "Content-Type": "application/json" } });
}
