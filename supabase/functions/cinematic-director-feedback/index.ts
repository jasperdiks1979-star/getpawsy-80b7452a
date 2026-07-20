// Director Feedback Loop — Phase 3 Self-Learning
// For every published director concept, pulls the latest Pinterest analytics
// (impressions, saves, outbound_clicks, CTR, engagement_rate) and feeds the
// results back into director_concept_results + director_archetype_weights.
//
// Winners (top composite score in their run) increase the archetype weight
// for their category. Losers decrease it. Weights are bounded [0.25 .. 3.0]
// and use an EWMA-style update so the system keeps adapting.
//
// Idempotent: safe to run on a cron every hour.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const W_MIN = 0.25;
const W_MAX = 3.0;
const ALPHA = 0.2; // EWMA learning rate

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const runIdFilter: string | undefined = body?.run_id;

    // 1. Concepts that have a job linked and need refreshing (or all if forced)
    let q = sb.from("director_concepts")
      .select("id, run_id, job_id, archetype, product_slug, category, predicted_score, composite_score, metrics_collected_at, is_winner")
      .not("job_id", "is", null);
    if (runIdFilter) q = q.eq("run_id", runIdFilter);
    const { data: concepts, error: cErr } = await q.limit(500);
    if (cErr) throw cErr;

    const updates: Array<{
      id: string; impressions: number; saves: number; outbound_clicks: number;
      ctr: number; engagement_rate: number; pinterest_quality_score: number | null;
      motion_score: number | null; commercial_score: number | null;
      ctr_pred_score: number | null; engagement_pred_score: number | null;
      composite_score: number; run_id: string; archetype: string; category: string | null;
    }> = [];

    for (const c of concepts ?? []) {
      // Pull job for quality + motion + pin_id
      const { data: job } = await sb.from("cinematic_ad_jobs")
        .select("pinterest_pin_id, pinterest_quality_score, motion_score, qa_composite_score")
        .eq("id", c.job_id!).maybeSingle();

      let impressions = 0, saves = 0, outbound = 0, ctr = 0, eng = 0;
      if (job?.pinterest_pin_id) {
        const { data: analytics } = await sb.from("pinterest_analytics_daily")
          .select("impressions, saves, outbound_clicks, ctr, engagement_rate, day")
          .eq("pin_id", job.pinterest_pin_id)
          .order("day", { ascending: false })
          .limit(30);
        for (const a of analytics ?? []) {
          impressions += a.impressions || 0;
          saves += a.saves || 0;
          outbound += a.outbound_clicks || 0;
        }
        if (impressions > 0) {
          ctr = outbound / impressions;
          eng = (saves + outbound) / impressions;
        }
      }

      const motion = job?.motion_score != null ? Number(job.motion_score) : null;
      const pq = job?.pinterest_quality_score != null ? Number(job.pinterest_quality_score) : null;
      const commercial = job?.qa_composite_score != null ? Number(job.qa_composite_score) : null;
      const ctrPred = ctr > 0 ? Math.min(100, Math.round(ctr * 1000)) : null; // ctr 0.01 -> 10
      const engPred = eng > 0 ? Math.min(100, Math.round(eng * 500)) : null;

      const composite = Math.round(
        (pq ?? 0) * 0.25 + (motion ?? 0) * 0.15 + (commercial ?? 0) * 0.20 +
        (ctrPred ?? 0) * 0.25 + (engPred ?? 0) * 0.15,
      );

      updates.push({
        id: c.id, impressions, saves, outbound_clicks: outbound, ctr, engagement_rate: eng,
        pinterest_quality_score: pq, motion_score: motion, commercial_score: commercial,
        ctr_pred_score: ctrPred, engagement_pred_score: engPred, composite_score: composite,
        run_id: c.run_id, archetype: c.archetype, category: c.category,
      });
    }

    // 2. Persist concept-level metrics
    for (const u of updates) {
      await sb.from("director_concepts").update({
        impressions: u.impressions, saves: u.saves, outbound_clicks: u.outbound_clicks,
        ctr: u.ctr, engagement_rate: u.engagement_rate,
        pinterest_quality_score: u.pinterest_quality_score, motion_score: u.motion_score,
        commercial_score: u.commercial_score, ctr_pred_score: u.ctr_pred_score,
        engagement_pred_score: u.engagement_pred_score, composite_score: u.composite_score,
        metrics_collected_at: new Date().toISOString(),
      }).eq("id", u.id);
    }

    // 3. Determine per-run winners & update archetype weights
    const byRun = new Map<string, typeof updates>();
    for (const u of updates) {
      const arr = byRun.get(u.run_id) ?? [];
      arr.push(u); byRun.set(u.run_id, arr);
    }

    let weightChanges = 0;
    for (const [runId, group] of byRun.entries()) {
      if (group.length < 2) continue; // need at least 2 to declare a winner
      const sorted = group.slice().sort((a, b) => b.composite_score - a.composite_score);
      const winner = sorted[0];
      const losers = sorted.slice(1);

      await sb.from("director_concepts").update({ is_winner: true }).eq("id", winner.id);
      await sb.from("director_runs").update({
        winner_job_id: (await sb.from("director_concepts").select("job_id").eq("id", winner.id).maybeSingle()).data?.job_id,
        winner_archetype: winner.archetype,
      }).eq("id", runId);

      // Apply EWMA weight updates per category (and wildcard)
      const cats = [winner.category, "*"].filter((v, i, a) => v != null && a.indexOf(v) === i) as string[];
      for (const cat of cats) {
        // Winner +
        await applyWeightDelta(sb, winner.archetype, cat, +ALPHA, winner, true);
        // Losers -
        for (const l of losers) {
          await applyWeightDelta(sb, l.archetype, cat, -ALPHA / losers.length, l, false);
        }
        weightChanges += 1 + losers.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      concepts_updated: updates.length,
      runs_scored: byRun.size,
      weight_changes: weightChanges,
      message: `Feedback loop processed ${updates.length} concepts across ${byRun.size} runs.`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, message: e instanceof Error ? e.message : "feedback failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function applyWeightDelta(
  sb: ReturnType<typeof createClient>,
  archetype: string,
  category: string,
  delta: number,
  metrics: { impressions: number; saves: number; outbound_clicks: number; ctr: number; engagement_rate: number },
  isWin: boolean,
) {
  const { data: existing } = await sb.from("director_archetype_weights")
    .select("id, weight, samples, wins, total_impressions, total_saves, total_clicks, avg_ctr, avg_engagement_rate")
    .eq("archetype", archetype).eq("category", category).maybeSingle();

  const prevWeight = existing ? Number(existing.weight) : 1.0;
  const newWeight = clamp(prevWeight * (1 + delta), W_MIN, W_MAX);
  const samples = (existing?.samples ?? 0) + 1;
  const wins = (existing?.wins ?? 0) + (isWin ? 1 : 0);
  const impr = (existing?.total_impressions ?? 0) + metrics.impressions;
  const sav = (existing?.total_saves ?? 0) + metrics.saves;
  const clk = (existing?.total_clicks ?? 0) + metrics.outbound_clicks;
  // EWMA on rates
  const prevCtr = Number(existing?.avg_ctr ?? 0);
  const prevEng = Number(existing?.avg_engagement_rate ?? 0);
  const avgCtr = prevCtr * (1 - ALPHA) + metrics.ctr * ALPHA;
  const avgEng = prevEng * (1 - ALPHA) + metrics.engagement_rate * ALPHA;

  if (existing) {
    await sb.from("director_archetype_weights").update({
      weight: newWeight, samples, wins,
      total_impressions: impr, total_saves: sav, total_clicks: clk,
      avg_ctr: avgCtr, avg_engagement_rate: avgEng,
      last_updated: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await sb.from("director_archetype_weights").insert({
      archetype, category, weight: newWeight, samples, wins,
      total_impressions: impr, total_saves: sav, total_clicks: clk,
      avg_ctr: avgCtr, avg_engagement_rate: avgEng,
    });
  }
}