// US Traffic Campaign metrics — admin only.
// Attributes qualified US sessions and checkout conversions to campaigns
// by joining utm_session_log ↔ cjie_session_journeys ↔ first_sales_events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const traceId = crypto.randomUUID();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, traceId, message: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, traceId, message: "unauthorized" }, 401);

  const svc = createClient(SUPABASE_URL, SERVICE);
  const { data: isAdmin } = await svc.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (!isAdmin) return json({ ok: false, traceId, message: "forbidden" }, 403);

  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? "14")));
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  try {
    const { data: campaigns = [] } = await svc
      .from("us_traffic_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    // Pull attributed UTM sessions in window (non-internal only).
    const { data: utmRows = [] } = await svc
      .from("utm_session_log")
      .select("session_id, utm_campaign, utm_source, created_at, is_internal")
      .gte("created_at", since)
      .eq("is_internal", false)
      .not("utm_campaign", "is", null);

    const sessionIds = Array.from(new Set(utmRows.map((r: any) => r.session_id).filter(Boolean)));
    const campByCode: Record<string, string> = {};
    for (const r of utmRows as any[]) if (r.utm_campaign) campByCode[r.session_id] = r.utm_campaign;

    // Fetch journeys for those sessions, US-only.
    let journeys: any[] = [];
    if (sessionIds.length) {
      // chunk to keep IN() small
      for (let i = 0; i < sessionIds.length; i += 500) {
        const slice = sessionIds.slice(i, i + 500);
        const { data } = await svc
          .from("cjie_session_journeys")
          .select("session_id, country, reached_atc, reached_checkout, reached_purchase")
          .in("session_id", slice);
        if (data) journeys.push(...data);
      }
    }
    const usJourneys = journeys.filter((j: any) => (j.country ?? "").toUpperCase() === "US");

    // Revenue per session from first_sales_events (purchase kind).
    const { data: revenueRows = [] } = await svc
      .from("first_sales_events")
      .select("session_id, revenue, event_kind, country, occurred_at")
      .gte("occurred_at", since)
      .eq("event_kind", "purchase");
    const revenueBySession: Record<string, number> = {};
    for (const r of revenueRows as any[]) {
      if (!r.session_id) continue;
      if ((r.country ?? "US").toUpperCase() !== "US") continue;
      revenueBySession[r.session_id] = (revenueBySession[r.session_id] ?? 0) + Number(r.revenue ?? 0);
    }

    // Aggregate per campaign.
    const perCampaign: Record<string, any> = {};
    for (const c of campaigns as any[]) {
      perCampaign[c.utm_campaign] = {
        campaign: c,
        qualified_us_sessions: 0,
        atc: 0,
        checkout_started: 0,
        purchases: 0,
        revenue: 0,
      };
    }

    for (const j of usJourneys) {
      const code = campByCode[j.session_id];
      if (!code) continue;
      const bucket = perCampaign[code];
      if (!bucket) continue;
      bucket.qualified_us_sessions += 1;
      if (j.reached_atc) bucket.atc += 1;
      if (j.reached_checkout) bucket.checkout_started += 1;
      if (j.reached_purchase) bucket.purchases += 1;
      bucket.revenue += revenueBySession[j.session_id] ?? 0;
    }

    const rows = Object.values(perCampaign).map((b: any) => {
      const spend = Number(b.campaign.daily_budget_usd ?? 0) * days;
      const cvr = b.qualified_us_sessions
        ? (b.purchases / b.qualified_us_sessions) * 100
        : 0;
      const cps = b.qualified_us_sessions ? spend / b.qualified_us_sessions : 0;
      return { ...b, planned_spend_usd: spend, checkout_cvr_pct: cvr, cost_per_session_usd: cps };
    });

    const totals = rows.reduce(
      (a: any, r: any) => ({
        qualified_us_sessions: a.qualified_us_sessions + r.qualified_us_sessions,
        atc: a.atc + r.atc,
        checkout_started: a.checkout_started + r.checkout_started,
        purchases: a.purchases + r.purchases,
        revenue: a.revenue + r.revenue,
        planned_spend_usd: a.planned_spend_usd + r.planned_spend_usd,
      }),
      { qualified_us_sessions: 0, atc: 0, checkout_started: 0, purchases: 0, revenue: 0, planned_spend_usd: 0 },
    );

    return json({
      ok: true,
      traceId,
      window_days: days,
      since,
      totals: {
        ...totals,
        checkout_cvr_pct: totals.qualified_us_sessions
          ? (totals.purchases / totals.qualified_us_sessions) * 100
          : 0,
        cost_per_session_usd: totals.qualified_us_sessions
          ? totals.planned_spend_usd / totals.qualified_us_sessions
          : 0,
      },
      campaigns: rows,
    });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});