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
  billing_profiles:  { scope: "billing:read",   access: "Restricted feature (commerce_integration)", action: "OAuth scopes are already complete. This endpoint requires Pinterest app entitlement for `commerce_integration`; reconnecting will not resolve it." },
  catalogs:          { scope: "catalogs:read",  access: "Standard", action: "Reconnect Pinterest Full Access and approve catalogs:read." },
  product_groups:    { scope: "catalogs:read",  access: "Standard", action: "Reconnect Pinterest Full Access and approve catalogs:read." },
  conversion_tags:   { scope: "ads:read",       access: "Standard", action: "Reconnect Pinterest Full Access and approve ads:read." },
  pin_edit_probe:    { scope: "pins:write",     access: "Restricted feature (pin_edit)",  action: "Pin PATCH requires the restricted pin_edit feature on app 1567611. Request via Pinterest developer support." },
  user_account:      { scope: "user_accounts:read", access: "Standard", action: "Reconnect and approve user_accounts:read." },
  boards:            { scope: "boards:read",    access: "Standard", action: "Reconnect and approve boards:read." },
};

// Endpoints that are restricted Pinterest app features rather than plain scopes.
const RESTRICTED_FEATURE_ENDPOINTS: Record<string, string> = {
  billing_profiles: "commerce_integration",
  pin_edit_probe: "pin_edit",
};

/**
 * Classify a failed endpoint: a Pinterest *restricted feature* rejection
 * (app entitlement — reconnect can never fix it) vs a real auth/scope failure.
 */
function classifyEndpointFailure(endpoint: string, status: number, body: unknown): {
  failure_type: "RESTRICTED_FEATURE_401" | "AUTH_OR_SCOPE_FAILURE" | "OTHER_ERROR";
  restricted_feature: string | null;
  recommend_reconnect: boolean;
  message: string | null;
} {
  const raw = String((body as any)?.message ?? "") || null;
  const match = raw?.match(/restricted feature[:\s`]*([a-z0-9_]+)/i);
  const knownRestricted = RESTRICTED_FEATURE_ENDPOINTS[endpoint];
  const isRestricted = !!match
    || /does not have access to this restricted feature/i.test(raw ?? "")
    || (!!knownRestricted && (status === 401 || status === 403));
  if (isRestricted) {
    const feature = match?.[1] ?? knownRestricted ?? "unknown";
    return {
      failure_type: "RESTRICTED_FEATURE_401",
      restricted_feature: feature,
      recommend_reconnect: false,
      message: `Pinterest app lacks restricted \`${feature}\` entitlement`,
    };
  }
  if (status === 401 || status === 403) {
    return { failure_type: "AUTH_OR_SCOPE_FAILURE", restricted_feature: null, recommend_reconnect: true, message: raw };
  }
  return { failure_type: "OTHER_ERROR", restricted_feature: null, recommend_reconnect: false, message: raw };
}

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
      .map(([name, r]) => {
        const cls = classifyEndpointFailure(name, r.status, r.body);
        return {
          name,
          status: r.status,
          code: (r.body as any)?.code ?? null,
          message: cls.message ?? (r.body as any)?.message ?? null,
          failure_type: cls.failure_type,
          restricted_feature: cls.restricted_feature,
          recommend_reconnect: cls.recommend_reconnect,
          manual_action: cls.recommend_reconnect ? (ENDPOINT_MANUAL_ACTION[name] ?? null) : null,
          entitlement_action: cls.recommend_reconnect ? null : (ENDPOINT_MANUAL_ACTION[name] ?? null),
        };
      });

    const authFixableFailures = failedEndpoints.filter((f) => f.recommend_reconnect);
    const restrictedFailures = failedEndpoints.filter((f) => f.failure_type === "RESTRICTED_FEATURE_401");
    const otherFailures = failedEndpoints.filter(
      (f) => f.failure_type === "OTHER_ERROR",
    );

    out.verification = {
      all_endpoints_200: failedEndpoints.length === 0,
      failed: failedEndpoints,
      auth_fixable_failures: authFixableFailures,
      restricted_feature_failures: restrictedFailures,
      other_failures: otherFailures,
      // Restricted-feature 401s must NOT mark the whole Ads API as failing.
      api_operational: authFixableFailures.length === 0 && otherFailures.length === 0,
      api_status_label:
        authFixableFailures.length === 0 && otherFailures.length === 0
          ? "Pinterest Ads API operational"
          : "Pinterest Ads API failing",
      restricted_endpoint_notes: restrictedFailures.map(
        (f) => `Restricted endpoint unavailable: ${f.name} (${f.restricted_feature} entitlement)`,
      ),
      reconnect_recommended: authFixableFailures.length > 0 || missingScopes.length > 0,
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
      ...(endpoints.billing_profiles?.ok ? [] : ["commerce_integration entitlement for billing reads"]),
      "pin_edit restricted feature for in-place pin PATCH",
      ...(grantedScopes.includes("biz_access:read") ? [] : ["biz_access:* (business manager access)"]),
    ];

    const campaignsRes = endpoints.campaigns;

    const campaigns: any[] = (campaignsRes.body as any)?.items ?? [];
    const perCampaign: any[] = [];
    for (const c of campaigns) {
      const cid = c.id;
      const adGroups = await pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups?campaign_ids=${cid}&page_size=100`, token);
      const ags: any[] = (adGroups.body as any)?.items ?? [];
      const adsPer: any[] = [];
      for (const ag of ags) {
        const ads = await pin(`/ad_accounts/${AD_ACCOUNT}/ads?ad_group_ids=${ag.id}&page_size=100`, token);
        adsPer.push({ ad_group_id: ag.id, ad_group_status: ag.status, ads: ads.body });
      }
      // Catalog Sales / Shopping campaigns serve via product_group_promotions,
      // not standard /ads — inspect them before concluding "no ads created".
      const isShopping = c.objective_type === "CATALOG_SALES" || c.objective_type === "SHOPPING";
      let shoppingPromotions: { total: number; active: number } | null = null;
      if (isShopping && ags.length > 0) {
        const agIds = ags.map((g: any) => g.id).join(",");
        const promos = await pin(
          `/ad_accounts/${AD_ACCOUNT}/product_group_promotions?ad_group_ids=${agIds}&page_size=100`,
          token,
        );
        const items: any[] = (promos.body as any)?.items ?? [];
        shoppingPromotions = {
          total: items.length,
          active: items.filter((p: any) => p.status === "ACTIVE").length,
        };
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
        is_shopping: isShopping,
        shopping_promotions: shoppingPromotions,
        analytics_7d: analytics,
      });
    }
    out.campaigns = perCampaign;

    // Diagnose root cause of zero delivery for each campaign.
    out.root_cause_summary = perCampaign.map((c: any) => {
      const reasons: string[] = [];
      if (c.status !== "ACTIVE") reasons.push(`campaign status = ${c.status}`);
      const activeAg = (c.ad_groups || []).filter((g: any) => g.status === "ACTIVE");
      if ((c.ad_groups || []).length === 0) reasons.push("no ad groups");
      else if (activeAg.length === 0) reasons.push("no ACTIVE ad groups");
      const totalAds = (c.ads || []).reduce(
        (n: number, x: any) => n + ((x?.ads?.items?.length) || 0), 0,
      );
      const activeAds = (c.ads || []).reduce(
        (n: number, x: any) => n + ((x?.ads?.items || []).filter((a: any) => a.status === "ACTIVE").length), 0,
      );
      const ana = (c.analytics_7d?.body as any);
      const imp = Array.isArray(ana) ? (ana[0]?.IMPRESSION_1 ?? 0) : 0;
      const promoTotal = c.shopping_promotions?.total ?? 0;
      const promoActive = c.shopping_promotions?.active ?? 0;

      if (c.is_shopping) {
        // Shopping/Catalog Sales never serves through /ads — do not infer
        // "no ads created" from an empty /ads list.
        if (promoTotal === 0 && imp === 0) reasons.push("no shopping promotion found");
      } else {
        if (totalAds === 0) reasons.push("no ads created");
        else if (activeAds === 0) reasons.push("no ACTIVE ads");
        if (imp === 0) reasons.push("0 impressions in last 7 days");
      }

      let rootCause = reasons.length ? reasons.join("; ") : "Delivering";
      if (c.is_shopping) {
        if (imp > 0) {
          rootCause = "Delivering via Shopping architecture";
        } else if (promoTotal > 0 || promoActive > 0) {
          rootCause = "SHOPPING promotion present; zero delivery cause not exposed by API";
        }
      }

      return {
        id: c.id, name: c.name, status: c.status,
        architecture: c.is_shopping ? "CATALOG_SALES_SHOPPING" : "STANDARD_ADS",
        shopping_promotion: c.shopping_promotions,
        shopping_promotion_label: c.is_shopping && promoTotal > 0 ? "SHOPPING promotion present" : null,
        impressions_7d: imp,
        root_cause: rootCause,
      };
    });

    // Persist diagnostic snapshot for audit trail.
    try {
      await sb.from("pinterest_post_logs").insert({
        action: "ads_diagnostic",
        status: (out.verification as any).api_operational ? "success" : "failed",
        error_message: (out.verification as any).api_operational
          ? null
          : `failed endpoints: ${authFixableFailures.concat(otherFailures).map((f) => `${f.name}=${f.status}`).join(", ")}`,
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
