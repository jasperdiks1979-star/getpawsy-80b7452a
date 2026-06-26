// Pinterest Traffic & Ads Forensic — read-only investigator.
// Mutates nothing. Aggregates OAuth, Ads, Billing, Campaign delivery, Organic
// pins, Website attribution, Pinterest Tag/CAPI, and Catalog health into one
// verdict + ranked action plan.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API = "https://api.pinterest.com/v5";
const AD_ACCOUNT = "549770199501";

const REQUIRED_SCOPES = [
  "ads:read","ads:write","billing:read","billing:write",
  "catalogs:read","catalogs:write","boards:read","boards:write",
  "pins:read","pins:write","user_accounts:read","user_accounts:write",
];

async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: { user } } = await sb.auth.getUser(auth.slice(7));
  if (!user) return false;
  const { data: role } = await sb.from("user_roles")
    .select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  return !!role;
}

async function pin(path: string, token: string) {
  try {
    const r = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const text = await r.text();
    let body: unknown; try { body = JSON.parse(text); } catch { body = text; }
    return { status: r.status, ok: r.ok, body };
  } catch (e) {
    return { status: 0, ok: false, body: { error: String((e as Error).message) } };
  }
}

function isoDaysAgo(d: number) {
  return new Date(Date.now() - d * 86400000).toISOString();
}
function ymd(d: Date) { return d.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  if (!(await isAdmin(req))) {
    return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const generated_at = new Date().toISOString();

    // -------- 1. OAuth health --------
    const { data: conn } = await sb.from("pinterest_connection")
      .select("access_token, scopes, token_expires_at, account_id, account_username, status, updated_at")
      .limit(1).maybeSingle();
    const token = (conn as any)?.access_token as string | undefined;
    const grantedScopes = String((conn as any)?.scopes ?? "")
      .split(/[\s,]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean);
    const missingScopes = REQUIRED_SCOPES.filter(s => !grantedScopes.includes(s));

    const oauth: any = {
      account_connected: !!token,
      account_username: (conn as any)?.account_username ?? "getpawsyshop",
      account_id: (conn as any)?.account_id ?? null,
      token_valid: !!token,
      token_expires_at: (conn as any)?.token_expires_at ?? null,
      granted_scopes: grantedScopes,
      missing_scopes: missingScopes,
      status: (conn as any)?.status ?? null,
      last_checked: generated_at,
      user_account: null as any,
      boards: null as any,
      board_count: 0,
      business_account: false,
      ad_account_accessible: false,
    };

    if (!token) {
      const verdict = "RED";
      return new Response(JSON.stringify({
        ok: true, traceId, verdict, generated_at,
        sections: { oauth }, action_plan: [{
          priority: "P0", problem: "No Pinterest token stored",
          evidence: "pinterest_connection row missing access_token",
          fix: "Reconnect Pinterest with full scopes at /admin/pinterest",
          lovable_can_fix: false, manual: true, risk: "low", mutates: false,
        }],
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userAcct = await pin("/user_account", token);
    oauth.user_account = { status: userAcct.status, ok: userAcct.ok, body: userAcct.body };
    oauth.business_account = (userAcct.body as any)?.account_type === "BUSINESS";

    const boardsRes = await pin("/boards?page_size=25", token);
    const boards = (boardsRes.body as any)?.items ?? [];
    oauth.boards = { status: boardsRes.status, ok: boardsRes.ok };
    oauth.board_count = boards.length;

    // -------- 2. Ads accounts --------
    const adAccountsRes = await pin("/ad_accounts?page_size=25", token);
    const adAccounts: any[] = (adAccountsRes.body as any)?.items ?? [];
    oauth.ad_account_accessible = adAccounts.length > 0;
    const ads_account_health = {
      api_status: adAccountsRes.status,
      api_ok: adAccountsRes.ok,
      accounts: adAccounts.map(a => ({
        ad_account_id: a.id, name: a.name, owner: a.owner,
        country: a.country, currency: a.currency,
        created_time: a.created_time,
      })),
      primary_account_id: AD_ACCOUNT,
    };

    // -------- 3. Billing --------
    const billingRes = await pin(`/ad_accounts/${AD_ACCOUNT}/billing_profiles`, token);
    const billing = {
      api_status: billingRes.status, api_ok: billingRes.ok,
      billing_profile_detected: billingRes.ok && Array.isArray((billingRes.body as any)?.items) && ((billingRes.body as any).items.length > 0),
      payment_method_detected: "UNKNOWN_API_LIMITATION",
      outstanding_balance: "UNKNOWN_API_LIMITATION",
      unpaid_invoices: "UNKNOWN_API_LIMITATION",
      spending_disabled: "UNKNOWN_API_LIMITATION",
      profiles: billingRes.ok ? (billingRes.body as any)?.items ?? [] : null,
      raw_error: billingRes.ok ? null : billingRes.body,
    };

    // -------- 4. Campaign delivery --------
    const campRes = await pin(`/ad_accounts/${AD_ACCOUNT}/campaigns?page_size=100`, token);
    const campaigns: any[] = (campRes.body as any)?.items ?? [];
    const startD = ymd(new Date(Date.now() - 7 * 86400000));
    const endD = ymd(new Date());
    const todayD = ymd(new Date());
    const perCampaign: any[] = [];
    for (const c of campaigns) {
      const ags = await pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups?campaign_ids=${c.id}&page_size=100`, token);
      const agItems = (ags.body as any)?.items ?? [];
      const adsR = await pin(`/ad_accounts/${AD_ACCOUNT}/ads?campaign_ids=${c.id}&page_size=100`, token);
      const adItems = (adsR.body as any)?.items ?? [];
      const analytics7 = await pin(
        `/ad_accounts/${AD_ACCOUNT}/campaigns/analytics?campaign_ids=${c.id}&start_date=${startD}&end_date=${endD}&columns=IMPRESSION_1,CLICKTHROUGH_1,OUTBOUND_CLICK_1,SPEND_IN_DOLLAR&granularity=TOTAL`,
        token,
      );
      const analyticsToday = await pin(
        `/ad_accounts/${AD_ACCOUNT}/campaigns/analytics?campaign_ids=${c.id}&start_date=${todayD}&end_date=${todayD}&columns=IMPRESSION_1,CLICKTHROUGH_1,OUTBOUND_CLICK_1,SPEND_IN_DOLLAR&granularity=TOTAL`,
        token,
      );
      const a7 = Array.isArray(analytics7.body) ? (analytics7.body as any[])[0] ?? {} : {};
      const aT = Array.isArray(analyticsToday.body) ? (analyticsToday.body as any[])[0] ?? {} : {};
      const rejected = adItems.filter((a: any) => a.review_status === "REJECTED" || a.status === "REJECTED");
      perCampaign.push({
        id: c.id, name: c.name, status: c.status,
        objective_type: c.objective_type,
        created_time: c.created_time, updated_time: c.updated_time,
        daily_spend_cap: c.daily_spend_cap, lifetime_spend_cap: c.lifetime_spend_cap,
        ad_groups_total: agItems.length,
        ad_groups_active: agItems.filter((g: any) => g.status === "ACTIVE").length,
        ads_total: adItems.length,
        ads_active: adItems.filter((a: any) => a.status === "ACTIVE").length,
        ads_rejected: rejected.length,
        rejection_reasons: rejected.map((r: any) => r.review_status_messages ?? r.rejected_reasons ?? null),
        spend_today: aT.SPEND_IN_DOLLAR ?? 0,
        impressions_today: aT.IMPRESSION_1 ?? 0,
        clicks_today: aT.CLICKTHROUGH_1 ?? 0,
        outbound_today: aT.OUTBOUND_CLICK_1 ?? 0,
        spend_7d: a7.SPEND_IN_DOLLAR ?? 0,
        impressions_7d: a7.IMPRESSION_1 ?? 0,
        clicks_7d: a7.CLICKTHROUGH_1 ?? 0,
        outbound_7d: a7.OUTBOUND_CLICK_1 ?? 0,
      });
    }
    const campaign_delivery = {
      api_status: campRes.status, api_ok: campRes.ok,
      total_campaigns: campaigns.length,
      active_campaigns: campaigns.filter(c => c.status === "ACTIVE").length,
      paused_campaigns: campaigns.filter(c => c.status === "PAUSED").length,
      draft_campaigns: campaigns.filter(c => c.status === "DRAFT").length,
      campaigns: perCampaign,
    };

    // -------- 5. Organic delivery (DB-side) --------
    const { data: pins24 } = await sb.from("pinterest_pins").select("id, created_at", { count: "exact" })
      .gte("created_at", isoDaysAgo(1)).limit(1);
    const { count: pins24c } = await sb.from("pinterest_pins").select("id", { count: "exact", head: true })
      .gte("created_at", isoDaysAgo(1));
    const { count: pins7c } = await sb.from("pinterest_pins").select("id", { count: "exact", head: true })
      .gte("created_at", isoDaysAgo(7));
    const { count: pins30c } = await sb.from("pinterest_pins").select("id", { count: "exact", head: true })
      .gte("created_at", isoDaysAgo(30));
    const { data: topPerf } = await sb.from("pinterest_pin_performance")
      .select("pin_id, impressions, outbound_clicks, saves, ctr, last_synced_at")
      .order("impressions", { ascending: false }).limit(20);
    const { data: topOutbound } = await sb.from("pinterest_pin_performance")
      .select("pin_id, impressions, outbound_clicks")
      .order("outbound_clicks", { ascending: false }).limit(20);
    const organic = {
      pins_24h: pins24c ?? 0,
      pins_7d: pins7c ?? 0,
      pins_30d: pins30c ?? 0,
      top_by_impressions: topPerf ?? [],
      top_by_outbound: topOutbound ?? [],
    };

    // -------- 6. Website attribution --------
    const { count: funnel24 } = await sb.from("pinterest_funnel_events")
      .select("id", { count: "exact", head: true }).gte("occurred_at", isoDaysAgo(1));
    const { count: funnel7 } = await sb.from("pinterest_funnel_events")
      .select("id", { count: "exact", head: true }).gte("occurred_at", isoDaysAgo(7));
    const { data: funnelBreak } = await sb.from("pinterest_funnel_events")
      .select("event_name").gte("occurred_at", isoDaysAgo(7)).limit(5000);
    const eventBreakdown: Record<string, number> = {};
    (funnelBreak ?? []).forEach((r: any) => {
      eventBreakdown[r.event_name] = (eventBreakdown[r.event_name] ?? 0) + 1;
    });
    const { count: utmSessions7 } = await sb.from("utm_session_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", isoDaysAgo(7)).ilike("utm_source", "pinterest%");
    const { count: attribSessions7 } = await sb.from("pinterest_attribution_sessions")
      .select("id", { count: "exact", head: true }).gte("first_seen", isoDaysAgo(7));
    const attribution = {
      pinterest_funnel_events_24h: funnel24 ?? 0,
      pinterest_funnel_events_7d: funnel7 ?? 0,
      event_breakdown_7d: eventBreakdown,
      utm_pinterest_sessions_7d: utmSessions7 ?? 0,
      pinterest_attribution_sessions_7d: attribSessions7 ?? 0,
    };

    // -------- 7. Pinterest Tag + CAPI --------
    const { count: capi24 } = await sb.from("pinterest_capi_outbox")
      .select("id", { count: "exact", head: true }).gte("created_at", isoDaysAgo(1));
    const { count: capi7 } = await sb.from("pinterest_capi_outbox")
      .select("id", { count: "exact", head: true }).gte("created_at", isoDaysAgo(7));
    const { count: capiSent7 } = await sb.from("pinterest_capi_outbox")
      .select("id", { count: "exact", head: true })
      .gte("created_at", isoDaysAgo(7)).eq("status", "sent");
    const { count: capiFailed7 } = await sb.from("pinterest_capi_outbox")
      .select("id", { count: "exact", head: true })
      .gte("created_at", isoDaysAgo(7)).eq("status", "failed");
    const { data: lastCapi } = await sb.from("pinterest_capi_outbox")
      .select("event_name, created_at, sent_at, status, last_error")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const tag_capi = {
      capi_events_24h: capi24 ?? 0,
      capi_events_7d: capi7 ?? 0,
      capi_sent_7d: capiSent7 ?? 0,
      capi_failed_7d: capiFailed7 ?? 0,
      capi_error_rate_7d: (capi7 ?? 0) > 0 ? ((capiFailed7 ?? 0) / (capi7 ?? 1)) : 0,
      last_capi_event: lastCapi ?? null,
      tag_installed_in_code: true, // SafePinterestTag is mounted in app
      page_visit_event_breakdown: {
        page_view: eventBreakdown.page_view ?? 0,
        add_to_cart: eventBreakdown.add_to_cart ?? 0,
        begin_checkout: eventBreakdown.begin_checkout ?? 0,
        purchase: eventBreakdown.purchase ?? 0,
      },
    };

    // -------- 8. Catalog / Merchant --------
    const catalogsRes = await pin("/catalogs", token);
    const catalogs: any[] = (catalogsRes.body as any)?.items ?? [];
    let feeds: any[] = [];
    if (catalogs[0]?.id) {
      const feedsRes = await pin(`/catalogs/feeds?catalog_id=${catalogs[0].id}`, token);
      feeds = (feedsRes.body as any)?.items ?? [];
    }
    const catalog = {
      api_status: catalogsRes.status, api_ok: catalogsRes.ok,
      catalogs_count: catalogs.length,
      catalogs: catalogs.map(c => ({ id: c.id, name: c.name, catalog_type: c.catalog_type })),
      feeds_count: feeds.length,
      feeds: feeds.map(f => ({
        id: f.id, name: f.name, status: f.status, format: f.format,
        location: f.location, default_country: f.default_country,
      })),
      raw_error: catalogsRes.ok ? null : catalogsRes.body,
    };

    // -------- 9. Root cause classification --------
    const causes: { code: string; label: string; evidence: string }[] = [];
    if (campaigns.length === 0) causes.push({ code: "A", label: "Ads not configured", evidence: "0 campaigns in ad account" });
    else {
      const anyActive = campaigns.some(c => c.status === "ACTIVE");
      if (!anyActive) causes.push({ code: "B", label: "Ads configured but paused", evidence: `${campaigns.length} campaigns, none ACTIVE` });
      const anyRejected = perCampaign.some(c => c.ads_rejected > 0);
      if (anyRejected) causes.push({ code: "D", label: "Ads rejected", evidence: "≥1 ad has REJECTED status" });
      const anySpend = perCampaign.some(c => Number(c.spend_7d) > 0);
      const anyImp = perCampaign.some(c => Number(c.impressions_7d) > 0);
      if (anyActive && !anyImp) causes.push({ code: "G", label: "Campaign budget/bid/targeting issue", evidence: "ACTIVE campaigns but 0 impressions 7d" });
      if (anyImp && !perCampaign.some(c => Number(c.outbound_7d) > 0)) {
        causes.push({ code: "I", label: "Impressions but no outbound clicks", evidence: "Pin creative/destination not converting clicks" });
      }
      if (anySpend === false && anyActive) causes.push({ code: "E", label: "Possible billing/payment issue", evidence: "ACTIVE campaigns with 0 spend 7d" });
    }
    if (!billing.api_ok) causes.push({ code: "O", label: "Billing API not readable", evidence: `billing_profiles ${billingRes.status}` });
    if (catalog.catalogs_count === 0) causes.push({ code: "M", label: "Catalog/Merchant issue", evidence: "0 catalogs returned" });
    if (organic.pins_7d === 0) causes.push({ code: "H", label: "Organic distribution suppressed", evidence: "0 new pins in 7d (publishing locked)" });
    if ((attribution.pinterest_funnel_events_7d ?? 0) === 0 && (perCampaign.some(c => Number(c.outbound_7d) > 0))) {
      causes.push({ code: "J", label: "Outbound clicks exist but tracking is broken", evidence: "Ads outbound > 0 but funnel events = 0" });
    }
    if ((tag_capi.capi_events_7d ?? 0) === 0) causes.push({ code: "L", label: "Pinterest Tag/CAPI dormant", evidence: "0 CAPI outbox events 7d" });
    if (missingScopes.length > 0) causes.push({ code: "O", label: "Missing OAuth scopes", evidence: `missing: ${missingScopes.join(", ")}` });
    if (causes.length === 0) causes.push({ code: "N", label: "No issue found, traffic volume simply too low", evidence: "All systems return healthy" });

    // -------- Verdict --------
    let verdict: "GREEN" | "YELLOW" | "RED" = "GREEN";
    if (
      campaigns.length === 0 ||
      missingScopes.length > 0 ||
      !billing.api_ok ||
      catalog.catalogs_count === 0 ||
      perCampaign.some(c => c.ads_rejected > 0) ||
      !campaigns.some(c => c.status === "ACTIVE")
    ) verdict = "RED";
    else if (
      perCampaign.every(c => Number(c.impressions_7d) === 0) ||
      (tag_capi.capi_events_7d ?? 0) === 0
    ) verdict = "YELLOW";

    // -------- Action plan --------
    const action_plan: any[] = [];
    if (missingScopes.length > 0) action_plan.push({
      priority: "P0", problem: `Missing OAuth scopes: ${missingScopes.join(", ")}`,
      evidence: `granted=${grantedScopes.length}/${REQUIRED_SCOPES.length}`,
      fix: "Reconnect Pinterest with full scopes at /admin/pinterest",
      lovable_can_fix: false, manual: true, risk: "low", mutates: false,
      effect: "Unblocks ads/billing/catalog reads",
    });
    if (campaigns.length === 0) action_plan.push({
      priority: "P0", problem: "No campaigns exist in ad account",
      evidence: `ad_account ${AD_ACCOUNT} returns 0 campaigns`,
      fix: "Create first campaign manually in Pinterest Ads Manager",
      lovable_can_fix: false, manual: true, risk: "medium", mutates: true,
      effect: "Enables ad delivery",
    });
    if (campaigns.length > 0 && !campaigns.some(c => c.status === "ACTIVE")) action_plan.push({
      priority: "P0", problem: "No ACTIVE campaigns",
      evidence: `statuses: ${campaigns.map(c => c.status).join(", ")}`,
      fix: "Activate at least one campaign in Pinterest Ads Manager",
      lovable_can_fix: false, manual: true, risk: "medium", mutates: true,
    });
    if (perCampaign.some(c => c.ads_rejected > 0)) action_plan.push({
      priority: "P0", problem: "One or more ads REJECTED",
      evidence: "see campaign_delivery.campaigns[*].rejection_reasons",
      fix: "Review rejection reasons; replace creative/destination URL",
      lovable_can_fix: false, manual: true, risk: "low", mutates: true,
    });
    if (!billing.billing_profile_detected) action_plan.push({
      priority: "P0", problem: "No billing profile detected",
      evidence: `billing_profiles status=${billingRes.status}`,
      fix: "Open https://ads.pinterest.com/billing and add a payment method",
      lovable_can_fix: false, manual: true, risk: "low", mutates: true,
    });
    if (catalog.catalogs_count === 0) action_plan.push({
      priority: "P1", problem: "No product catalog connected",
      evidence: "GET /catalogs returns 0 items",
      fix: "Submit feed at https://www.pinterest.com/business/catalogs/",
      lovable_can_fix: false, manual: true, risk: "low", mutates: true,
    });
    if ((tag_capi.capi_events_7d ?? 0) === 0) action_plan.push({
      priority: "P1", problem: "Pinterest CAPI outbox empty 7d",
      evidence: "0 rows in pinterest_capi_outbox last 7d",
      fix: "Verify pinterest-capi-relay function is invoked on purchase events",
      lovable_can_fix: true, manual: false, risk: "low", mutates: false,
    });
    if (organic.pins_7d === 0) action_plan.push({
      priority: "P2", problem: "No organic pin publishing in 7d",
      evidence: "publishing locked (global_stop=true, pcie2_publish_enabled=false)",
      fix: "Once trust score ≥60 and ads healthy, unlock canary publishing",
      lovable_can_fix: true, manual: false, risk: "medium", mutates: true,
    });

    const result = {
      ok: true, traceId, generated_at, account: "getpawsyshop", verdict,
      sections: {
        oauth, ads_account_health, billing, campaign_delivery,
        organic, attribution, tag_capi, catalog,
      },
      root_cause: causes[0] ?? null,
      secondary_causes: causes.slice(1),
      action_plan,
      manual_action_links: {
        ads_billing: "https://ads.pinterest.com/billing",
        ads_manager: "https://ads.pinterest.com/",
        business_hub: "https://business.pinterest.com/",
        catalogs: "https://www.pinterest.com/business/catalogs/",
        account_apps: "https://www.pinterest.com/settings/apps/",
      },
      safety: {
        mutations_performed: 0,
        mode: "read-only",
        confirmed_no_publish: true,
        confirmed_no_ad_changes: true,
      },
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});