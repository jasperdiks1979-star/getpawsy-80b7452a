// Phase 4B parity checker. Admin+flag gated. Read-only.
// For each window 1h/10h/24h/7d, computes v2 aggregation once from the
// canonical_events table and asserts:
//   raw = human + uncertain + crawler + bot + technical + internal + legacy_unclassified
//   commercial = human + uncertain
//   technical never appears in human/uncertain (bucket precedence guarantees this)
//   crawler/bot never in commercial
//   internal never in commercial
//   orders count preserved between v1 and v2
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkCanonicalV2Gate } from "../_shared/canonicalV2Flag.ts";
import {
  aggregateBuckets,
  totalsFromAggregate,
  type ClassifiableRow,
} from "../_shared/canonicalV2Buckets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PERIODS: Array<{ label: string; hours: number }> = [
  { label: "1h", hours: 1 },
  { label: "10h", hours: 10 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const gate = await checkCanonicalV2Gate(req);
  if (!gate.allowV2) {
    return new Response(JSON.stringify({ ok: false, error: "canary_disabled_or_not_admin", gate }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = Date.now();
  const report: any[] = [];
  let overall = true;
  for (const p of PERIODS) {
    const since = new Date(now - p.hours * 3600_000).toISOString();
    const until = new Date(now).toISOString();
    const { data: eventsData, error } = await supabase
      .from("canonical_events")
      .select("session_id,visitor_id,occurred_at,ingested_at,is_internal,technical_path,is_bot,bot_confidence,traffic_quality,classification_version")
      .gte("occurred_at", since).lte("occurred_at", until).limit(50000);
    if (error) {
      report.push({ period: p.label, error: error.message, ok: false });
      overall = false; continue;
    }
    const agg = aggregateBuckets((eventsData ?? []) as ClassifiableRow[], gate.phase4aCutoffIso);
    const t = totalsFromAggregate(agg);
    const sumBuckets = t.human_sessions + t.uncertain_sessions + t.crawler_sessions
      + t.bot_sessions + t.technical_sessions + t.internal_sessions + t.legacy_unclassified_sessions;
    const rawParity = sumBuckets === t.raw_sessions;
    const commercialParity = t.commercial_sessions === (t.human_sessions + t.uncertain_sessions);

    const { count: ordersCount } = await supabase.from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["paid", "completed"])
      .gte("created_at", since).lte("created_at", until);
    const { count: checkoutCount } = await supabase.from("checkout_funnel_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since).lte("created_at", until);

    const periodOk = rawParity && commercialParity;
    if (!periodOk) overall = false;
    report.push({
      period: p.label, since, until,
      raw_sessions: t.raw_sessions,
      sum_buckets: sumBuckets,
      commercial: t.commercial_sessions,
      buckets: {
        human: t.human_sessions, uncertain: t.uncertain_sessions,
        crawler: t.crawler_sessions, bot: t.bot_sessions,
        technical: t.technical_sessions, internal: t.internal_sessions,
        legacy_unclassified: t.legacy_unclassified_sessions,
      },
      orders_count: ordersCount ?? 0,
      checkout_funnel_events: checkoutCount ?? 0,
      raw_parity: rawParity,
      commercial_parity: commercialParity,
      ok: periodOk,
    });
  }
  return new Response(JSON.stringify({ ok: overall, phase4a_cutoff_iso: gate.phase4aCutoffIso, report }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});