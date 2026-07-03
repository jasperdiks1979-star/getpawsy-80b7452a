import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireInternalOrAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function countSince(table: string, col: string, sinceIso: string): Promise<number> {
  const { count, error } = await admin
    .from(table).select("*", { count: "exact", head: true })
    .gte(col, sinceIso);
  if (error) return 0;
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;
  try {
    const day = new Date();
    day.setUTCHours(0,0,0,0);
    const yesterday = new Date(day.getTime() - 24*3600*1000);
    const since = yesterday.toISOString();
    const until = day.toISOString();

    const [server_sessions, engagement_starts, visitor_rows, purchases] = await Promise.all([
      countSince("utm_session_log", "created_at", since),
      countSince("analytics_engagement_starts", "fired_at", since),
      countSince("visitor_activity", "created_at", since),
      admin.from("analytics_funnel_waterfall").select("*", { count: "exact", head: true }).gte("purchase_at", since).then(r => r.count ?? 0),
    ]);

    const { data: cls } = await admin
      .from("analytics_traffic_classification")
      .select("traffic_type")
      .gte("created_at", since).lt("created_at", until);
    const total = cls?.length || 0;
    const pct = (t: string) => total > 0 ? +((cls!.filter((r: any) => r.traffic_type === t).length / total) * 100).toFixed(2) : 0;

    const { data: geo } = await admin
      .from("analytics_geo_quality")
      .select("confidence")
      .gte("created_at", since).lt("created_at", until);
    const geoTotal = geo?.length || 0;
    const geoOk = geo?.filter((r: any) => r.confidence !== "Unknown").length || 0;
    const geo_pct = geoTotal > 0 ? +((geoOk / geoTotal) * 100).toFixed(2) : 0;

    const row = {
      report_date: yesterday.toISOString().slice(0,10),
      server_sessions, engagement_starts,
      ga4_pageviews: 0,
      visitor_activity_rows: visitor_rows,
      purchases,
      geo_success_pct: geo_pct,
      human_pct: pct("human"),
      bot_pct: pct("bot") + pct("crawler"),
      prefetch_pct: pct("prefetch") + pct("prerender"),
      unknown_pct: pct("unknown"),
      classification_breakdown: {
        human: pct("human"), prefetch: pct("prefetch"), prerender: pct("prerender"),
        crawler: pct("crawler"), bot: pct("bot"), internal: pct("internal"), unknown: pct("unknown"),
      },
    };
    await admin.from("analytics_daily_validation").upsert(row, { onConflict: "report_date" });

    return new Response(JSON.stringify({ ok: true, report: row }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});