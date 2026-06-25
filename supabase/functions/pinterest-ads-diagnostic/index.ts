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
      .select("access_token, refresh_token, scopes, expires_at, ad_account_id")
      .limit(1).maybeSingle();
    const token = (conn as { access_token?: string } | null)?.access_token;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, traceId, message: "no pinterest token" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const out: Record<string, unknown> = {
      ok: true, traceId, ad_account_id: AD_ACCOUNT,
      generated_at: new Date().toISOString(),
      connection: { scopes: (conn as any)?.scopes, expires_at: (conn as any)?.expires_at, db_ad_account_id: (conn as any)?.ad_account_id },
    };

    // 1. Ad account
    out.ad_account = await pin(`/ad_accounts/${AD_ACCOUNT}`, token);
    // 2. Billing
    out.billing_profiles = await pin(`/ad_accounts/${AD_ACCOUNT}/billing_profiles`, token);
    // 3. Catalogs
    out.catalogs = await pin(`/catalogs`, token);
    // 4. Tag (pixel)
    out.conversion_tags = await pin(`/ad_accounts/${AD_ACCOUNT}/conversion_tags`, token);
    // 5. Campaigns
    const campaignsRes = await pin(`/ad_accounts/${AD_ACCOUNT}/campaigns?page_size=100`, token);
    out.campaigns_raw = campaignsRes;

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

    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: String((e as Error).message) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});