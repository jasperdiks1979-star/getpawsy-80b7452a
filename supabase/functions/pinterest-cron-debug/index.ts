// pinterest-cron-debug — read-only diagnostic that replays the cron selector
// step-by-step and reports, per queued row, exactly which gate would exclude
// it. Mirrors pinterest-cron-worker selection without mutating anything.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MAX_RETRIES = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const nowIso = new Date().toISOString();
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();

  // 1. Runtime flags / caps
  const { data: rt } = await sb
    .from("pinterest_runtime_settings")
    .select("auto_approve_queue, scale_unlocked, daily_pin_cap, min_gap_minutes, warmup_until, us_score_threshold, per_category_daily_cap, production_publish_verified, production_trial_detected, deploy_verified_at, deploy_verification_window_minutes")
    .eq("id", 1)
    .maybeSingle();
  const autoApprove = !!(rt as any)?.auto_approve_queue;
  const usScoreThreshold = Number((rt as any)?.us_score_threshold ?? 0.55);
  const perCatCap = Math.max(1, Number((rt as any)?.per_category_daily_cap ?? 8));
  const dailyCap = Number((rt as any)?.daily_pin_cap ?? 4);

  // 2. Counts per status
  const { data: byStatus } = await sb
    .from("pinterest_pin_queue")
    .select("status")
    .limit(5000);
  const statusCounts: Record<string, number> = {};
  for (const r of byStatus || []) {
    const k = (r as any).status || "(null)";
    statusCounts[k] = (statusCounts[k] || 0) + 1;
  }

  // 3. Replay the exact cron base query
  let q = sb
    .from("pinterest_pin_queue")
    .select("id, status, scheduled_at, approved_at, profit_state, retries, board_id, product_slug, category_key, us_audience_score, pin_image_url, destination_link, pin_title, priority")
    .eq("status", "queued")
    .or("profit_state.is.null,profit_state.neq.kill")
    .lte("scheduled_at", nowIso)
    .lt("retries", MAX_RETRIES);
  if (!autoApprove) q = q.not("approved_at", "is", null);
  const { data: candidates, error } = await q
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(50);

  // 4. Pre-load per-category daily usage
  const { data: postedToday } = await sb
    .from("pinterest_pin_queue")
    .select("category_key")
    .eq("status", "posted")
    .gte("posted_at", oneDayAgo);
  const catCounts: Record<string, number> = {};
  for (const r of postedToday || []) {
    const k = ((r as any).category_key || "(uncat)").toString().toLowerCase();
    catCounts[k] = (catCounts[k] || 0) + 1;
  }

  // 5. Per-candidate exclusion reasons (read-only, mirrors cron gates)
  const rows = (candidates || []).map((p: any) => {
    const reasons: string[] = [];
    const score = Number(p.us_audience_score ?? 1);
    if (Number.isFinite(score) && score < usScoreThreshold) reasons.push(`us_score<${usScoreThreshold}`);
    if (!p.board_id) reasons.push("board_id NULL");
    if (!p.pin_image_url || !/^https?:\/\//i.test(String(p.pin_image_url))) reasons.push("pin_image_url invalid");
    if (!p.destination_link) reasons.push("destination_link empty");
    const k = (p.category_key || "(uncat)").toString().toLowerCase();
    if ((catCounts[k] || 0) >= perCatCap) reasons.push(`per_category_cap(${catCounts[k]}/${perCatCap})`);
    return {
      id: p.id,
      product_slug: p.product_slug,
      category_key: p.category_key,
      board_id: p.board_id,
      pin_title: p.pin_title,
      priority: p.priority,
      scheduled_at: p.scheduled_at,
      approved_at: p.approved_at,
      us_audience_score: score,
      eligible: reasons.length === 0,
      exclusion_reasons: reasons,
    };
  });

  const firstEligible = rows.find((r) => r.eligible) || null;
  const nextCandidate = rows[0] || null;

  return new Response(
    JSON.stringify({
      ok: true,
      now: nowIso,
      runtime: {
        auto_approve_queue: autoApprove,
        us_score_threshold: usScoreThreshold,
        per_category_daily_cap: perCatCap,
        daily_pin_cap: dailyCap,
        production_publish_verified: !!(rt as any)?.production_publish_verified,
        deploy_verified_at: (rt as any)?.deploy_verified_at || null,
      },
      status_counts: statusCounts,
      base_query: {
        sql: "status=queued AND scheduled_at<=now AND retries<3 AND (profit_state IS NULL OR profit_state!=kill)" +
          (autoApprove ? "" : " AND approved_at IS NOT NULL"),
        candidate_count: rows.length,
        error: error?.message || null,
      },
      selected_pin_id: firstEligible?.id || null,
      next_candidate: nextCandidate,
      candidates: rows,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});