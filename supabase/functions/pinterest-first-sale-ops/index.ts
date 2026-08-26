// GETPAWSY PINTEREST FIRST-SALE CAMPAIGN OPS
// Admin-gated. Actions:
//   discover  — read-only account/catalog/campaign/tracking discovery
//   build     — create PAUSED campaign + PAUSED ad group + product group promotion (dry_run supported)
//   readback  — read effective state of created objects from Pinterest
// SAFETY: never sets status ACTIVE. All writes force status "PAUSED".
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API = "https://api.pinterest.com/v5";
const AD_ACCOUNT = "549770199501";
const CATALOG_ID = "4812802272679";
const ITEM_ID = "c59309f4-0e6e-4b90-8a27-4177f001a585";
const PRODUCT_GROUP_ID = "4673049493396";

const CAMPAIGN_NAME = "GetPawsy | First Sale | US | Accordion Cat Scratcher";
const AD_GROUP_NAME = "US | Accordion Scratcher | Prospecting";
const PROMOTION_NAME = "Accordion Scratcher | First Sale Test";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: { user } } = await sb.auth.getUser(auth.slice(7));
  if (!user) return false;
  const { data: role } = await sb.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return !!role;
}

async function pin(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await r.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 800); }
  return { status: r.status, ok: r.ok, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const traceId = crypto.randomUUID();
  if (!(await isAdmin(req))) return json({ ok: false, traceId, message: "unauthorized" }, 401);

  const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(payload.action ?? "discover");
  const dryRun = payload.dry_run !== false;
  const dailyBudgetMicros = Number(payload.daily_budget_micros ?? 0);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: conn } = await sb.from("pinterest_connection").select("access_token, scopes, status").limit(1).maybeSingle();
  const token = (conn as { access_token?: string } | null)?.access_token;
  if (!token) return json({ ok: false, traceId, message: "no pinterest token" });

  const ledger: unknown[] = [];

  // ---------- shared reads ----------
  const readCore = async () => {
    const [item, pg, campaigns, ocpm, tags] = await Promise.all([
      pin(`/catalogs/product_groups/${PRODUCT_GROUP_ID}/product_counts?ad_account_id=${AD_ACCOUNT}`, token),
      pin(`/catalogs/product_groups/${PRODUCT_GROUP_ID}?ad_account_id=${AD_ACCOUNT}`, token),
      pin(`/ad_accounts/${AD_ACCOUNT}/campaigns?page_size=100`, token),
      pin(`/ad_accounts/${AD_ACCOUNT}/conversion_tags/ocpm_eligible`, token),
      pin(`/ad_accounts/${AD_ACCOUNT}/conversion_tags`, token),
    ]);
    return { item, pg, campaigns, ocpm, tags };
  };

  if (action === "read_path") {
    const path = String(payload.path ?? "");
    if (!/^\/(catalogs|ad_accounts)\//.test(path)) return json({ ok: false, traceId, message: "path not allowed" }, 400);
    const res = await pin(path, token);
    return json({ ok: true, traceId, action, path, res });
  }

  if (action === "read_item") {
    const res = await pin(`/catalogs/products/get_by_product_group_filters?ad_account_id=${AD_ACCOUNT}`, token, {
      method: "POST",
      body: JSON.stringify({
        catalog_type: "RETAIL",
        feed_id: "1550597640822",
        product_group_filters: { all_of: [{ ITEM_ID: { values: [ITEM_ID], negated: false } }] },
      }),
    });
    return json({ ok: true, traceId, action, res });
  }

  if (action === "discover") {
    const core = await readCore();
    const existing = ((core.campaigns.body as any)?.items ?? []).filter((c: any) =>
      String(c.name).toLowerCase().includes("accordion") || String(c.name) === CAMPAIGN_NAME
    );
    // detail on the most recent SALES draft, if any
    const salesDrafts = ((core.campaigns.body as any)?.items ?? []).filter((c: any) => c.objective_type === "SALES");
    const draftDetails: unknown[] = [];
    for (const c of salesDrafts.slice(-3)) {
      const ags = await pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups?campaign_ids=${c.id}`, token);
      const ads = await pin(`/ad_accounts/${AD_ACCOUNT}/ads?campaign_ids=${c.id}`, token);
      draftDetails.push({ campaign: c, ad_groups: ags.body, ads: ads.body });
    }
    return json({ ok: true, traceId, action, core, existing_accordion_campaigns: existing, sales_drafts: draftDetails });
  }

  if (action === "build") {
    const core = await readCore();

    // ---- GATE 1: product group scope ----
    const pgBody = core.pg.body as any;
    const filters = pgBody?.filters?.all_of ?? [];
    const ids: string[] = filters.flatMap((f: any) => f?.ITEM_ID?.values ?? []);
    if (pgBody?.id !== PRODUCT_GROUP_ID || ids.length !== 1 || ids[0] !== ITEM_ID) {
      return json({ ok: false, traceId, verdict: "PRODUCT_GROUP_VALIDATION_FAILED", product_group: pgBody });
    }

    // ---- GATE 2: item truth ----
    const counts = core.item.body as any;
    const it = counts;
    if (!(counts?.total === 1 && counts?.in_stock === 1)) {
      return json({ ok: false, traceId, verdict: "PRODUCT_GROUP_VALIDATION_FAILED", reason: "product counts != exactly 1 in-stock product", counts });
    }

    // ---- GATE 3: duplicate guard ----
    const allCampaigns = ((core.campaigns.body as any)?.items ?? []);
    const dupe = allCampaigns.find((c: any) => c.name === CAMPAIGN_NAME);

    if (dryRun) {
      return json({
        ok: true, traceId, action, dry_run: true,
        would_create: { campaign: CAMPAIGN_NAME, ad_group: AD_GROUP_NAME, promotion: PROMOTION_NAME },
        gates: { product_group: "PASS", item: it, duplicate_campaign: dupe ?? null },
        ocpm_eligible: core.ocpm.body,
      });
    }

    let campaignId = dupe?.id as string | undefined;
    if (!campaignId) {
      const body: Record<string, unknown> = {
        ad_account_id: AD_ACCOUNT,
        name: CAMPAIGN_NAME,
        objective_type: "CATALOG_SALES",
        status: "PAUSED",
        is_performance_plus: false,
      };
      if (dailyBudgetMicros > 0) body.daily_spend_cap = dailyBudgetMicros;
      const res = await pin(`/ad_accounts/${AD_ACCOUNT}/campaigns`, token, { method: "POST", body: JSON.stringify([body]) });
      ledger.push({ op: "create_campaign", status: res.status, body: res.body });
      const created = (res.body as any)?.items?.[0];
      if (created?.exceptions?.length || !created?.data?.id) {
        return json({ ok: false, traceId, verdict: "CAMPAIGN_CREATE_FAILED", ledger });
      }
      campaignId = created.data.id;
    } else {
      ledger.push({ op: "reuse_campaign", id: campaignId });
    }

    // ---- ad group (PAUSED) ----
    const agList = await pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups?campaign_ids=${campaignId}`, token);
    let adGroupId = ((agList.body as any)?.items ?? []).find((a: any) => a.name === AD_GROUP_NAME)?.id as string | undefined;
    if (!adGroupId) {
      const agBody: Record<string, unknown> = {
        ad_account_id: AD_ACCOUNT,
        campaign_id: campaignId,
        name: AD_GROUP_NAME,
        status: "PAUSED",
        billable_event: "CLICKTHROUGH",
        optimization_goal_metadata: {
          conversion_tag_v3_goal_metadata: {
            attribution_windows: { click_window_days: 30, engagement_window_days: 30, view_window_days: 1 },
            conversion_event: "CHECKOUT",
            learning_mode_type: "NOT_ACTIVE",
            is_roas_optimized: false,
            ...(payload.conversion_tag_id ? { conversion_tag_id: String(payload.conversion_tag_id) } : {}),
          },
        },
        bid_strategy_type: "AUTOMATIC_BID",
        targeting_spec: {
          LOCATION: ["US"],
          GENDER: ["female", "male", "unknown"],
          APPTYPE: ["web", "ipad", "web_mobile", "iphone", "android_mobile", "android_tablet"],
          TARGETING_STRATEGY: ["CHOOSE_YOUR_OWN"],
        },
        placement_group: "ALL",
        pacing_delivery_type: "STANDARD",
        auto_targeting_enabled: true,
        default_utm_source_enabled: true,
        custom_url_parameters: {
          utm_source: "pinterest",
          utm_medium: "paid_social",
          utm_campaign: "first_sale_accordion_scratcher",
          utm_content: "accordion_scratcher_catalog",
        },
      };
      if (dailyBudgetMicros > 0) {
        agBody.budget_in_micro_currency = dailyBudgetMicros;
        agBody.budget_type = "DAILY";
      }
      const res = await pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups`, token, { method: "POST", body: JSON.stringify([agBody]) });
      ledger.push({ op: "create_ad_group", status: res.status, body: res.body });
      const created = (res.body as any)?.items?.[0];
      if (created?.exceptions?.length || !created?.data?.id) {
        return json({ ok: false, traceId, verdict: "AD_GROUP_CREATE_FAILED", campaign_id: campaignId, ledger });
      }
      adGroupId = created.data.id;
    } else {
      ledger.push({ op: "reuse_ad_group", id: adGroupId });
    }

    // ---- product group promotion (PAUSED) ----
    const promoList = await pin(`/ad_accounts/${AD_ACCOUNT}/product_group_promotions?ad_group_id=${adGroupId}`, token);
    let promoId = ((promoList.body as any)?.items ?? []).find((p: any) => p.name === PROMOTION_NAME)?.id as string | undefined;
    if (!promoId) {
      const res = await pin(`/ad_accounts/${AD_ACCOUNT}/product_group_promotions`, token, {
        method: "POST",
        body: JSON.stringify({
          ad_group_id: adGroupId,
          product_group_promotion: [{
            catalog_product_group_id: PRODUCT_GROUP_ID,
            name: PROMOTION_NAME,
            is_enabled: false,
            included_product_count: 1,
          }],
        }),
      });
      ledger.push({ op: "create_product_group_promotion", status: res.status, body: res.body });
      promoId = (res.body as any)?.items?.[0]?.data?.id;
    } else {
      ledger.push({ op: "reuse_promotion", id: promoId });
    }

    return json({ ok: true, traceId, action, campaign_id: campaignId, ad_group_id: adGroupId, promotion_id: promoId, ledger });
  }

  if (action === "disable_promotion") {
    const res = await pin(`/ad_accounts/${AD_ACCOUNT}/product_group_promotions`, token, {
      method: "PATCH",
      body: JSON.stringify({ product_group_promotion: [{ id: String(payload.promotion_id), is_enabled: false }] }),
    });
    return json({ ok: res.ok, traceId, action, res });
  }

  if (action === "readback") {
    const campaignId = String(payload.campaign_id ?? "");
    const [c, ags, ads, promos, pg] = await Promise.all([
      pin(`/ad_accounts/${AD_ACCOUNT}/campaigns?campaign_ids=${campaignId}`, token),
      pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups?campaign_ids=${campaignId}`, token),
      pin(`/ad_accounts/${AD_ACCOUNT}/ads?campaign_ids=${campaignId}`, token),
      pin(`/ad_accounts/${AD_ACCOUNT}/product_group_promotions?ad_group_ids=${String(payload.ad_group_id ?? "")}`, token),
      pin(`/catalogs/product_groups/${PRODUCT_GROUP_ID}?ad_account_id=${AD_ACCOUNT}`, token),
    ]);
    return json({ ok: true, traceId, action, campaign: c.body, ad_groups: ags.body, ads: ads.body, promotions: promos.body, product_group: pg.body });
  }

  return json({ ok: false, traceId, message: `unknown action ${action}` }, 400);
});
