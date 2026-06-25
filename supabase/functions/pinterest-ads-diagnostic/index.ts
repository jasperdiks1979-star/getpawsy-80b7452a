import "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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
        granted: grantedScopes,
        missing: missingScopes,
        all_granted: missingScopes.length === 0,
      },
    };

    const endpoints: Record<string, { status: number; ok: boolean; body: unknown }> = {};
    endpoints.ad_account = await pin(`/ad_accounts/${AD_ACCOUNT}`, token);
    endpoints.campaigns = await pin(`/ad_accounts/${AD_ACCOUNT}/campaigns?page_size=100`, token);
    endpoints.ad_groups = await pin(`/ad_accounts/${AD_ACCOUNT}/ad_groups?page_size=100`, token);
    endpoints.ads = await pin(`/ad_accounts/${AD_ACCOUNT}/ads?page_size=100`, token);
    endpoints.billing_profiles = await pin(`/ad_accounts/${AD_ACCOUNT}/billing_profiles`, token);
    endpoints.catalogs = await pin(`/catalogs`, token);
    endpoints.conversion_tags = await pin(`/ad_accounts/${AD_ACCOUNT}/conversion_tags`, token);
    out.endpoints = endpoints;

    const failedEndpoints = Object.entries(endpoints)
      .filter(([, r]) => !r.ok)
      .map(([name, r]) => ({
        name,
        status: r.status,
        code: (r.body as any)?.code ?? null,
        message: (r.body as any)?.message ?? null,
      }));
    out.verification = {
      all_endpoints_200: failedEndpoints.length === 0,
      failed: failedEndpoints,
    };

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
      if (totalAds === 0) reasons.push("no ads created");
      else if (activeAds === 0) reasons.push("no ACTIVE ads");
      const ana = (c.analytics_7d?.body as any);
      const imp = Array.isArray(ana) ? (ana[0]?.IMPRESSION_1 ?? 0) : 0;
      if (imp === 0) reasons.push("0 impressions in last 7 days");
      return {
        id: c.id, name: c.name, status: c.status,
        impressions_7d: imp,
        root_cause: reasons.length ? reasons.join("; ") : "Delivering",
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