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
  "ads:read",
  "ads:write",
  "catalogs:read",
  "catalogs:write",
  "billing:read",
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
  "user_accounts:read",
];

// Broader "full access" set used when the operator clicks Reconnect Full Access.
// These are scopes Pinterest exposes for Standard Access apps. `biz_access:*` and
// `billing:write` may require Advanced Access / commerce_integration approval.
const FULL_ACCESS_SCOPES = [
  ...REQUIRED_SCOPES,
  "billing:write",
  "user_accounts:write",
  "boards:read_secret",
  "boards:write_secret",
  "pins:read_secret",
  "pins:write_secret",
  "biz_access:read",
  "biz_access:write",
];

// Map endpoint name -> manual action shown to the operator when it fails.
const ENDPOINT_MANUAL_ACTION: Record<string, { scope: string; access: string; action: string }> = {
  ad_account:        { scope: "ads:read",       access: "Standard", action: "Reconnect Pinterest Full Access and approve ads:read." },
  campaigns:         { scope: "ads:read",       access: "Standard", action: "Reconnect Pinterest Full Access and approve ads:read." },
  ad_groups:         { scope: "ads:read",       access: "Standard", action: "Reconnect Pinterest Full Access and approve ads:read." },
  ads:               { scope: "ads:read",       access: "Standard", action: "Reconnect Pinterest Full Access and approve ads:read." },
  billing_profiles:  { scope: "billing:read",   access: "Restricted feature (commerce_integration)", action: "Pinterest Developer / Support entitlement required for the restricted `commerce_integration` feature on app 1567611. Reconnecting OAuth will NOT add this entitlement." },
  catalogs:          { scope: "catalogs:read",  access: "Standard", action: "Reconnect Pinterest Full Access and approve catalogs:read." },
  product_groups:    { scope: "catalogs:read",  access: "Standard", action: "Reconnect Pinterest Full Access and approve catalogs:read." },
  conversion_tags:   { scope: "ads:read",       access: "Standard", action: "Reconnect Pinterest Full Access and approve ads:read." },
  pin_edit_probe:    { scope: "pins:write",     access: "Restricted feature (pin_edit)",  action: "Pin PATCH requires the restricted pin_edit feature on app 1567611. Request via Pinterest developer support." },
  user_account:      { scope: "user_accounts:read", access: "Standard", action: "Reconnect and approve user_accounts:read." },
  boards:            { scope: "boards:read",    access: "Standard", action: "Reconnect and approve boards:read." },
};

/**
 * Distinguish a real auth/scope failure (fixable by re-consent) from a
 * Pinterest *app entitlement* failure (restricted feature — reconnect can
 * never fix it).
 */
function classifyEndpointFailure(status: number, body: unknown): {
  entitlement_status: "OK" | "RESTRICTED_FEATURE_401" | "AUTH_OR_SCOPE_FAILURE" | "OTHER_ERROR";
  restricted_feature: string | null;
  reconnect_can_fix: boolean;
} {
  const msg = String((body as any)?.message ?? "");
  const m = msg.match(/restricted feature:\s*([a-z0-9_]+)/i);
  if (m || /does not have access to this restricted feature/i.test(msg)) {
    return {
      entitlement_status: "RESTRICTED_FEATURE_401",
      restricted_feature: m?.[1] ?? "unknown",
      reconnect_can_fix: false,
    };
  }
  if (status === 401 || status === 403) {
    return { entitlement_status: "AUTH_OR_SCOPE_FAILURE", restricted_feature: null, reconnect_can_fix: true };
  }
  return { entitlement_status: "OTHER_ERROR", restricted_feature: null, reconnect_can_fix: false };
}

const CATALOG_OBJECTIVES = new Set(["CATALOG_SALES", "SHOPPING", "CONSIDERATION_SHOPPING"]);


async function isAuthed(req: Request): Promise<boolean> {
  const internal = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (internal && req.headers.get("x-internal-secret") === internal) return true;
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
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, ok: r.ok, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  if (!(await isAuthed(req))) {
    return new Response(JSON.stringify({ ok: false, traceId, message: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: conn } = await sb.from("pinterest_connection")
      .select("access_token, refresh_token, scopes, token_expires_at, account_id, status")
      .limit(1).maybeSingle();
    const token = (conn as { access_token?: string } | null)?.access_token;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "no pinterest token" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const grantedScopes = String((conn as any)?.scopes ?? "")
      .split(/[\s,]+/).map((s: string) => s.trim().toLowerCase()).filter(Boolean);
    const missingScopes = REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));
    const missingFullAccess = FULL_ACCESS_SCOPES.filter((s) => !grantedScopes.includes(s));

    const out: Record<string, unknown> = {
      ok: true, traceId, ad_account_id: AD_ACCOUNT,
      generated_at: new Date().toISOString(),
      connection: {
        scopes: (conn as any)?.scopes,
        token_expires_at: (conn as any)?.token_expires_at,
        account_id: (conn as any)?.account_id,
        status: (conn as any)?.status,
      },
      scope_check: {
        required: REQUIRED_SCOPES,
        full_access_target: FULL_ACCESS_SCOPES,
        granted: grantedScopes,
        missing: missingScopes,
        missing_full_access: missingFullAccess,
        all_granted: missingScopes.length === 0,
        full_access: missingFullAccess.length === 0,
      },
    };

    const endpoints: Record<string, { status: number; ok: boolean; body: unknown }> = {};
    endpoints.user_account = await pin(`/user_account`, token);
    endpoints.boards = await pin(`/boards?page_size=25`, token);
    endpoints.ad_account = await pin(`/ad_accounts/${AD_ACCOUNT}`, token);
    endpoints.campaigns = await pin(`/ad_accounts/${AD_ACCOUNT}/campaigns?page_size=100`, token);
    endpoints.ad_groups = await pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups?page_size=100`, token);
    endpoints.ads = await pin(`/ad_accounts/${AD_ACCOUNT}/ads?page_size=100`, token);
    endpoints.billing_profiles = await pin(`/ad_accounts/${AD_ACCOUNT}/billing_profiles`, token);
    endpoints.catalogs = await pin(`/catalogs`, token);
    // Product groups: requires a catalog id; we attempt against the first catalog returned.
    const firstCatalogId = (endpoints.catalogs.body as any)?.items?.[0]?.id;
    if (firstCatalogId) {
      endpoints.product_groups = await pin(`/catalogs/product_groups?catalog_id=${firstCatalogId}&page_size=25`, token);
    }
    endpoints.conversion_tags = await pin(`/ad_accounts/${AD_ACCOUNT}/conversion_tags`, token);
    out.endpoints = endpoints;

    const failedEndpoints = Object.entries(endpoints)
      .filter(([, r]) => !r.ok)
      .map(([name, r]) => ({
        name,
        status: r.status,
        code: (r.body as any)?.code ?? null,
        message: (r.body as any)?.message ?? null,
        ...classifyEndpointFailure(r.status, r.body),
        manual_action: ENDPOINT_MANUAL_ACTION[name] ?? null,
      }));

    // Endpoint entitlement matrix — separates OAuth scope status from Pinterest
    // app feature entitlements. A granted scope does NOT imply endpoint access.
    const entitlement_matrix = Object.entries(endpoints).map(([name, r]) => {
      const scope = ENDPOINT_MANUAL_ACTION[name]?.scope ?? null;
      const cls = r.ok
        ? { entitlement_status: "OK" as const, restricted_feature: null, reconnect_can_fix: false }
        : classifyEndpointFailure(r.status, r.body);
      return {
        endpoint: name,
        http_status: r.status,
        scope_required: scope,
        scope_status: scope ? (grantedScopes.includes(scope) ? "PRESENT" : "MISSING") : "N/A",
        ...cls,
      };
    });

    const restrictedFeatures = Array.from(new Set(
      entitlement_matrix
        .filter((e) => e.entitlement_status === "RESTRICTED_FEATURE_401")
        .map((e) => e.restricted_feature || "unknown"),
    ));

    out.verification = {
      all_endpoints_200: failedEndpoints.length === 0,
      // Failures that OAuth re-consent can actually fix.
      auth_fixable_failures: failedEndpoints.filter((f) => f.reconnect_can_fix),
      restricted_feature_failures: failedEndpoints.filter((f) => f.entitlement_status === "RESTRICTED_FEATURE_401"),
      failed: failedEndpoints,
    };
    out.entitlements = {
      matrix: entitlement_matrix,
      restricted_features_unavailable: restrictedFeatures,
      restricted_feature_access: restrictedFeatures.length === 0 ? "FULL" : "PARTIAL",
      summary: restrictedFeatures.length === 0
        ? "No restricted-feature rejections observed."
        : `Pinterest rejects ${restrictedFeatures.join(", ")} — restricted app feature, not an OAuth scope problem.`,
    };

    // OAuth diagnosis: reconnect is only a valid fix for missing scopes,
    // invalid/expired tokens, or explicit re-consentable auth failures.
    const tokenExpiry = (conn as any)?.token_expires_at ? Date.parse((conn as any).token_expires_at) : null;
    const tokenExpired = tokenExpiry !== null && Number.isFinite(tokenExpiry) && tokenExpiry < Date.now();
    const authFailure = failedEndpoints.some((f) => f.reconnect_can_fix);
    const reconnectRecommended = missingScopes.length > 0 || tokenExpired || authFailure;
    out.oauth_diagnosis = {
      scopes_complete: missingScopes.length === 0,
      missing_scopes: missingScopes,
      token_expired: tokenExpired,
      auth_or_scope_endpoint_failure: authFailure,
      reconnect_recommended: reconnectRecommended,
      headline: missingScopes.length === 0 && !tokenExpired && !authFailure
        ? "OAuth scopes already complete."
        : "OAuth reconnect required.",
      detail: reconnectRecommended
        ? "Re-consent can resolve the listed scope/token issues."
        : restrictedFeatures.length > 0
          ? `Remaining endpoint failures are restricted app features (${restrictedFeatures.join(", ")}). Pinterest Developer / Support entitlement may be required. Reconnecting OAuth will not add this entitlement.`
          : "No OAuth action required.",
    };

    out.capabilities = {
      can_read_organic: endpoints.boards?.ok && endpoints.user_account?.ok,
      can_publish_pins: grantedScopes.includes("pins:write"),
      can_read_ads: endpoints.ad_account?.ok === true,
      can_manage_ads: grantedScopes.includes("ads:write") && endpoints.ad_account?.ok === true,
      can_manage_catalogs: grantedScopes.includes("catalogs:write") && endpoints.catalogs?.ok === true,
      can_read_billing: endpoints.billing_profiles?.ok === true,
      can_edit_pins_patch: false, // requires pin_edit restricted feature; verified separately
    };
    out.requires_pinterest_approval = [
      ...(endpoints.billing_profiles?.ok
        ? []
        : ["commerce_integration (restricted feature) for billing_profiles — entitlement, not scope"]),
      "pin_edit restricted feature for in-place pin PATCH",
      ...(grantedScopes.includes("biz_access:read") ? [] : ["biz_access:* (business manager access)"]),
    ];

    // ---- Catalog item-count sources (never reconciled by guessing) ----
    try {
      const { data: catStatus } = await sb.from("pinterest_catalog_status").select("*").eq("id", 1).maybeSingle();
      const { count: localProducts } = await sb.from("products").select("id", { count: "exact", head: true });
      let liveXmlItems: number | null = null;
      const feedUrl = (catStatus as any)?.feed_url;
      if (feedUrl) {
        try {
          const xml = await (await fetch(feedUrl)).text();
          liveXmlItems = (xml.match(/<item[\s>]/g) || []).length || null;
        } catch { liveXmlItems = null; }
      }
      out.catalog_counts = {
        live_feed_xml: { value: liveXmlItems, source: "live XML fetch of registered feed URL" },
        pinterest_ingested: {
          value: (catStatus as any)?.items_total ?? null,
          source: "Pinterest feed processing report (items_total)",
        },
        pinterest_invalid: {
          value: (catStatus as any)?.items_invalid ?? null,
          source: "Pinterest feed processing report (items_invalid)",
        },
        local_products: { value: localProducts ?? null, source: "local products table" },
        timestamps: {
          feed_registered_accepted_at: (catStatus as any)?.accepted_at ?? null,
          last_checked_at: (catStatus as any)?.last_checked_at ?? null,
          latest_feed_ingestion: (catStatus as any)?.raw?.last_ingestion_at
            ?? (catStatus as any)?.raw?.completed_at
            ?? null,
        },
        note: "Counts come from different systems and are reported separately. Differences are not reconciled.",
      };
    } catch { /* diagnostic only */ }


    const campaignsRes = endpoints.campaigns;

    const campaigns: any[] = (campaignsRes.body as any)?.items ?? [];
    const perCampaign: any[] = [];
    for (const c of campaigns) {
      const cid = c.id;
      const isShopping = CATALOG_OBJECTIVES.has(String(c.objective_type || "").toUpperCase());
      const adGroups = await pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups?campaign_ids=${cid}&page_size=100`, token);
      const ags: any[] = (adGroups.body as any)?.items ?? [];
      const adsPer: any[] = [];
      const promotionsPer: any[] = [];
      for (const ag of ags) {
        const ads = await pin(`/ad_accounts/${AD_ACCOUNT}/ads?ad_group_ids=${ag.id}&page_size=100`, token);
        adsPer.push({ ad_group_id: ag.id, ad_group_status: ag.status, ads: ads.body });
        // SHOPPING ad groups serve through product_group_promotions, NOT /ads.
        const promos = await pin(
          `/ad_accounts/${AD_ACCOUNT}/product_group_promotions?ad_group_id=${ag.id}&page_size=100`,
          token,
        );
        promotionsPer.push({
          ad_group_id: ag.id,
          ad_group_status: ag.status,
          http_status: promos.status,
          items: (promos.body as any)?.items ?? [],
          error: promos.ok ? null : ((promos.body as any)?.message ?? null),
        });
      }
      // Delivery diagnostics (analytics last 7d)
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const analytics = await pin(
        `/ad_accounts/${AD_ACCOUNT}/campaigns/analytics?campaign_ids=${cid}&start_date=${start}&end_date=${end}&columns=IMPRESSION_1,CLICKTHROUGH_1,SPEND_IN_DOLLAR&granularity=TOTAL`,
        token,
      );
      perCampaign.push({
        id: cid,
        name: c.name,
        status: c.status,
        objective_type: c.objective_type,
        is_shopping_architecture: isShopping,
        daily_spend_cap: c.daily_spend_cap,
        lifetime_spend_cap: c.lifetime_spend_cap,
        start_time: c.start_time,
        end_time: c.end_time,
        is_flexible_daily_budgets: c.is_flexible_daily_budgets,
        ad_groups: ags.map((g) => ({
          id: g.id, name: g.name, status: g.status,
          budget_in_micro_currency: g.budget_in_micro_currency,
          bid_in_micro_currency: g.bid_in_micro_currency,
          billable_event: g.billable_event,
          targeting_spec: g.targeting_spec,
          start_time: g.start_time, end_time: g.end_time,
          pacing_delivery_type: g.pacing_delivery_type,
        })),
        ads: adsPer,
        product_group_promotions: promotionsPer,
        analytics_7d: analytics,
      });
    }
    out.campaigns = perCampaign;

    // Explicit diagnostic states. We never claim a root cause the API does not prove.
    out.root_cause_summary = perCampaign.map((c: any) => {
      const labels: string[] = [];
      const evidence: string[] = [];
      const isShopping = !!c.is_shopping_architecture;

      const activeAg = (c.ad_groups || []).filter((g: any) => g.status === "ACTIVE");
      const totalAds = (c.ads || []).reduce((n: number, x: any) => n + ((x?.ads?.items?.length) || 0), 0);
      const activeAds = (c.ads || []).reduce(
        (n: number, x: any) => n + ((x?.ads?.items || []).filter((a: any) => a.status === "ACTIVE").length), 0,
      );
      const allPromos = (c.product_group_promotions || []).flatMap((p: any) => p.items || []);
      const activePromos = allPromos.filter(
        (p: any) => String(p.status || "").toUpperCase() === "ACTIVE",
      );
      const promoApiBlocked = (c.product_group_promotions || []).some(
        (p: any) => p.http_status === 401 || p.http_status === 403,
      );

      const ana = (c.analytics_7d?.body as any);
      const imp = Array.isArray(ana) ? (ana[0]?.IMPRESSION_1 ?? 0) : 0;
      const spend = Array.isArray(ana) ? (ana[0]?.SPEND_IN_DOLLAR ?? 0) : 0;

      if (c.status !== "ACTIVE") { labels.push("CAMPAIGN_PAUSED"); evidence.push(`campaign status = ${c.status}`); }
      if ((c.ad_groups || []).length === 0) { labels.push("AD_GROUP_PAUSED"); evidence.push("no ad groups"); }
      else if (activeAg.length === 0) { labels.push("AD_GROUP_PAUSED"); evidence.push("no ACTIVE ad groups"); }

      if (isShopping) {
        if (promoApiBlocked) {
          labels.push("API_RESTRICTED_FEATURE");
          evidence.push("product_group_promotions read returned 401/403");
        } else if (allPromos.length === 0) {
          labels.push("NO_SHOPPING_PROMOTION");
          evidence.push("no product_group_promotions on any ad group");
        } else {
          labels.push("SHOPPING_PROMOTION_PRESENT");
          evidence.push(`${allPromos.length} product_group_promotion(s), ${activePromos.length} ACTIVE`);
        }
      } else {
        if (totalAds === 0) { labels.push("NO_ADS_CREATED"); evidence.push("0 ads on a non-shopping campaign"); }
        else if (activeAds === 0) { labels.push("NO_ACTIVE_ADS"); evidence.push(`${totalAds} ads, 0 ACTIVE`); }
      }

      if (imp === 0) { labels.push("NO_IMPRESSIONS_LAST_7D"); evidence.push(`impressions_7d = 0, spend_7d = ${spend}`); }

      const shoppingStalled =
        isShopping && c.status === "ACTIVE" && activeAg.length > 0 && activePromos.length > 0 && imp === 0;
      if (shoppingStalled) labels.push("SHOPPING_PROMOTION_PRESENT_NO_DELIVERY");

      let diagnosis: string;
      if (imp > 0) diagnosis = "Delivering.";
      else if (shoppingStalled) {
        diagnosis = "SHOPPING promotion present but not delivering — serving/review/entitlement cause not exposed by API.";
      } else if (labels.length > 0) {
        diagnosis = `Blocked by: ${labels.filter((l) => l !== "NO_IMPRESSIONS_LAST_7D").join(", ") || "UNKNOWN_SERVING_BLOCKER"}.`;
      } else {
        labels.push("UNKNOWN_SERVING_BLOCKER");
        diagnosis = "No API-proven blocker found.";
      }

      return {
        id: c.id, name: c.name, status: c.status,
        objective_type: c.objective_type,
        architecture: isShopping ? "CATALOG_SALES_SHOPPING" : "STANDARD_ADS",
        impressions_7d: imp,
        spend_7d: spend,
        ads_count: totalAds,
        shopping_promotions_count: allPromos.length,
        shopping_promotions_active: activePromos.length,
        labels,
        evidence,
        root_cause: diagnosis,
      };
    });


    // Persist diagnostic snapshot for audit trail.
    try {
      await sb.from("pinterest_post_logs").insert({
        action: "ads_diagnostic",
        status: (out.verification as any).all_endpoints_200 ? "success" : "failed",
        error_message: (out.verification as any).all_endpoints_200
          ? null
          : `failed endpoints: ${failedEndpoints.map((f) => `${f.name}=${f.status}`).join(", ")}`,
        response_data: {
          ad_account_id: AD_ACCOUNT,
          scope_check: out.scope_check,
          verification: out.verification,
          root_cause_summary: out.root_cause_summary,
        },
      });
    } catch { /* best effort */ }

    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});