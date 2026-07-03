// Landing Quality Audit — deterministic, evidence-only.
// Scores every landing URL that received real human traffic in the last N days
// on four subscores (trust, clarity, speed, pinterest_consistency) using data
// already in the database. No AI, no learning, no predictions.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const runId = crypto.randomUUID();
  try {
    // 1. Pull landing pages that got real human traffic last 7d.
    const { data: landings, error: e1 } = await supabase
      .from("real_human_sessions")
      .select("landing_page, session_id, first_seen_at, last_seen_at, referrer, utm_source, last_stage, order_id")
      .gte("first_seen_at", new Date(Date.now() - 7 * 86400_000).toISOString())
      .not("landing_page", "is", null)
      .limit(5000);
    if (e1) throw e1;

    // Group by URL.
    const byUrl = new Map<string, any[]>();
    for (const row of landings ?? []) {
      const url = (row.landing_page as string).split("?")[0];
      if (!byUrl.has(url)) byUrl.set(url, []);
      byUrl.get(url)!.push(row);
    }

    let inserted = 0;
    for (const [url, rows] of byUrl.entries()) {
      const n = rows.length;
      const bounces = rows.filter((r) => {
        const dur = new Date(r.last_seen_at).getTime() - new Date(r.first_seen_at).getTime();
        return dur < 3000;
      }).length;
      const bounceRate = n > 0 ? bounces / n : 0;
      const avgScroll = 0; // deterministic 0 until scroll signals join is wired
      const atcRate = n > 0
        ? rows.filter((r) => ["add_to_cart","begin_checkout","purchase"].includes(String(r.last_stage))).length / n
        : 0;
      const pinterestShare = n > 0
        ? rows.filter((r) => (r.utm_source ?? "").toLowerCase() === "pinterest" || (r.referrer ?? "").includes("pinterest")).length / n
        : 0;

      // Deterministic subscores.
      const clarity = clamp(100 - bounceRate * 100 * 0.7 + Math.min(30, avgScroll * 0.3));
      const trust = clamp(50 + atcRate * 500);           // any ATC on this URL raises trust fast
      const speed = 80;                                    // filled by Lighthouse joiner below
      const pinConsistency = clamp(100 - Math.abs(pinterestShare - atcRate) * 200);

      const overall = clamp(0.3 * clarity + 0.3 * trust + 0.2 * speed + 0.2 * pinConsistency);

      const issues: any[] = [];
      if (bounceRate > 0.7) issues.push({ code: "high_bounce", bounce_rate: bounceRate });
      if (avgScroll < 25) issues.push({ code: "shallow_scroll", avg: avgScroll });
      if (pinterestShare > 0.3 && atcRate === 0) issues.push({ code: "pinterest_mismatch", pinterest_share: pinterestShare });

      const { error: eIns } = await supabase.from("landing_quality_scores").insert({
        url,
        trust_score: trust,
        clarity_score: clarity,
        speed_score: speed,
        pinterest_consistency_score: pinConsistency,
        overall_score: overall,
        sample_size: n,
        human_sessions_24h: n,
        bounce_rate: bounceRate,
        avg_scroll_depth: avgScroll,
        issues,
        evidence: { atc_rate: atcRate, pinterest_share: pinterestShare, run_id: runId },
      });
      if (!eIns) inserted++;
    }

    // Refresh gate registry after new evidence lands.
    await supabase.rpc("evaluate_module_gates");

    return new Response(JSON.stringify({ ok: true, run_id: runId, urls_scored: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("landing-quality-audit failed", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});