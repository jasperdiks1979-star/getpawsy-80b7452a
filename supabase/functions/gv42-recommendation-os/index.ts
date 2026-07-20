// Genesis V4.2 — Pinterest Recommendation Intelligence OS.
// Additive layer on top of gv42_recommendation_v + gv41-feed-quality.
// Computes per-candidate Pinterest Recommendation Score (PRS, 0-100) with
// explainable breakdowns. No new tables; audit via pcie_v2_events.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

type Row = Record<string, any>;

const WEIGHTS = {
  audience: 12,        // q.us_audience_score
  product_visibility: 8,
  safe_zone: 4,
  perf_history: 14,    // saves+clicks+ctr
  novelty: 12,         // 100 - repeat penalty
  feed_quality: 14,    // from gv41-feed-quality (100 - fatigue)
  freshness: 6,        // age penalty
  us_timing: 8,        // posting window
  intent_signals: 10,  // creative.scores intent if present
  diversity_repeat: 12,// negative weight applied as 100 - repeats
};

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }
function safe(n: any, d = 0) { const x = Number(n); return Number.isFinite(x) ? x : d; }

function usHourScore(catKey: string | null, windows: Row[]) {
  const nowEt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const h = nowEt.getHours();
  // pet-shopping intent window 9-23 ET (existing policy)
  if (h < 9 || h > 23) return 30;
  const match = windows.find(w => (w.category_key ?? null) === catKey && Number(w.hour_of_day) === h);
  if (match && match.sample_size > 5) return clamp(safe(match.score) * 100, 30, 100);
  // default mid-window if no per-category sample
  if (h >= 18 && h <= 22) return 85;
  if (h >= 12 && h <= 17) return 75;
  return 60;
}

function scoreRow(r: Row, fatigue: number, windows: Row[]) {
  const reasons: { label: string; delta: number }[] = [];

  // Audience
  const aud = clamp(safe(r.us_audience_score) * (r.us_audience_score > 1 ? 1 : 100));
  const audPts = (aud / 100) * WEIGHTS.audience;
  reasons.push({ label: `audience ${aud.toFixed(0)}`, delta: +audPts.toFixed(1) });

  // Visibility
  const vis = clamp(safe(r.product_visibility_score) * (r.product_visibility_score > 1 ? 1 : 100));
  const visPts = (vis / 100) * WEIGHTS.product_visibility;
  reasons.push({ label: `product visibility ${vis.toFixed(0)}`, delta: +visPts.toFixed(1) });

  // Safe zone
  const sz = clamp(safe(r.safe_zone_score) * (r.safe_zone_score > 1 ? 1 : 100));
  const szPts = (sz / 100) * WEIGHTS.safe_zone;
  reasons.push({ label: `safe zone ${sz.toFixed(0)}`, delta: +szPts.toFixed(1) });

  // Perf history (per-product)
  const imps = safe(r.impressions_sum);
  const saves = safe(r.saves_sum), clicks = safe(r.clicks_sum);
  let perfPts = 0, perfLabel = "no history";
  if (imps > 50) {
    const saveRate = saves / Math.max(imps, 1);
    const ctr = clicks / Math.max(imps, 1);
    const blend = clamp((saveRate * 4 + ctr * 2) * 1000, 0, 100); // heuristic
    perfPts = (blend / 100) * WEIGHTS.perf_history;
    perfLabel = `history ${blend.toFixed(0)} (sv ${saves}/cl ${clicks}/imp ${imps})`;
  } else {
    perfPts = WEIGHTS.perf_history * 0.35; // exploration credit
    perfLabel = `exploration credit (n=${imps})`;
  }
  reasons.push({ label: perfLabel, delta: +perfPts.toFixed(1) });

  // Novelty / diversity repeat
  const repeats = safe(r.recent_family_repeats);
  const repeatPenalty = Math.min(repeats * 6, WEIGHTS.diversity_repeat);
  const noveltyPts = (WEIGHTS.diversity_repeat - repeatPenalty);
  reasons.push({ label: `headline repeats ${repeats}`, delta: -repeatPenalty.toFixed(1) as unknown as number });

  // Feed fatigue (global)
  const fqPts = ((100 - clamp(fatigue)) / 100) * WEIGHTS.feed_quality;
  reasons.push({ label: `feed fatigue ${fatigue.toFixed(0)}`, delta: +fqPts.toFixed(1) });

  // Freshness (draft age penalty after 36h)
  const ageH = (Date.now() - new Date(r.created_at).getTime()) / 36e5;
  const freshScore = clamp(100 - Math.max(0, ageH - 36) * 2);
  const freshPts = (freshScore / 100) * WEIGHTS.freshness;
  reasons.push({ label: `freshness ${freshScore.toFixed(0)}`, delta: +freshPts.toFixed(1) });

  // US timing
  const tScore = usHourScore(r.category_key ?? null, windows);
  const tPts = (tScore / 100) * WEIGHTS.us_timing;
  reasons.push({ label: `US timing ${tScore.toFixed(0)}`, delta: +tPts.toFixed(1) });

  // Intent signals
  const sc = r.creative_scores ?? {};
  const intent = clamp(safe(sc.ctr_intent ?? sc.outbound_intent ?? sc.intent ?? 0));
  const intentPts = (intent / 100) * WEIGHTS.intent_signals;
  reasons.push({ label: `intent ${intent.toFixed(0)}`, delta: +intentPts.toFixed(1) });

  // Novelty bucket (separate small contribution from creative scores.novelty)
  const nov = clamp(safe(sc.novelty ?? sc.world_diversity ?? 50));
  const novPts = (nov / 100) * WEIGHTS.novelty;
  reasons.push({ label: `novelty ${nov.toFixed(0)}`, delta: +novPts.toFixed(1) });

  const totalRaw = audPts + visPts + szPts + perfPts + noveltyPts + fqPts + freshPts + tPts + intentPts + novPts;
  const maxRaw = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const prs = clamp((totalRaw / maxRaw) * 100);

  // Probabilistic projections (heuristic, never certainty)
  const projections = {
    expected_save_rate: +((0.002 + (prs / 100) * 0.018).toFixed(4)),
    expected_outbound_ctr: +((0.003 + (prs / 100) * 0.030).toFixed(4)),
    expected_distribution_velocity: +((prs / 100) * 1.6).toFixed(2),
    expected_session_quality: +((0.3 + (prs / 100) * 0.55).toFixed(2)),
    expected_purchase_probability: +((prs / 100) * 0.008).toFixed(4),
    expected_follow_rate: +((prs / 100) * 0.004).toFixed(4),
    expected_repin_rate: +((prs / 100) * 0.015).toFixed(4),
    expected_evergreen_score: +clamp(prs * 0.9 + (intent + nov) / 4).toFixed(1),
  };

  // Discovery Index — diversity-weighted novelty (no synthetic floor)
  const discoveryIndex = clamp(0.5 * nov + 0.3 * (100 - clamp(fatigue)) + 0.2 * (WEIGHTS.diversity_repeat - repeatPenalty) * (100 / WEIGHTS.diversity_repeat));

  return {
    queue_id: r.queue_id,
    product_id: r.product_id,
    product_slug: r.product_slug,
    product_name: r.product_name,
    creative_id: r.creative_id,
    pin_title: r.pin_title,
    pin_image_url: r.pin_image_url,
    board_name: r.board_name,
    category_key: r.category_key,
    status: r.status,
    prs: +prs.toFixed(1),
    discovery_index: +discoveryIndex.toFixed(1),
    reasons,
    projections,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "cycle";
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(500, Math.max(10, Number(body?.limit ?? 200)));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Feed quality (reused)
    let fatigue = 50, feedReport: any = null;
    try {
      const { data } = await supabase.functions.invoke("gv41-feed-quality", { body: { window: 150, persist: false } });
      fatigue = Number(data?.feed_fatigue_index ?? 50);
      feedReport = data ?? null;
    } catch (_) { /* keep heuristic default */ }

    // 2) Posting windows
    const { data: windows } = await supabase
      .from("pinterest_posting_windows")
      .select("category_key,hour_of_day,score,sample_size,timezone")
      .eq("timezone", "America/New_York");

    // 3) Candidates
    const { data: rows, error } = await supabase
      .from("gv42_recommendation_v")
      .select("*")
      .limit(limit);
    if (error) throw error;

    const scored = (rows ?? []).map(r => scoreRow(r as Row, fatigue, windows ?? []));
    scored.sort((a, b) => b.prs - a.prs);

    const winners = scored.slice(0, 4);
    const losing = [...scored].sort((a, b) => a.prs - b.prs).slice(0, 5);

    // 4) Audit ledger (best-effort)
    try {
      await supabase.from("pcie_v2_events").insert({
        kind: "gv42_recommendation_cycle",
        payload: {
          action,
          scored_n: scored.length,
          fatigue,
          top_prs: winners.map(w => ({ queue_id: w.queue_id, prs: w.prs, reasons: w.reasons })),
          generated_at: new Date().toISOString(),
        },
      });
    } catch (_) {}

    // 5) Optional safe re-prioritise: bump top winners' priority within existing caps.
    let prioritised = 0;
    if (action === "cycle" && winners.length) {
      for (const w of winners) {
        const { error: e } = await supabase
          .from("pinterest_pin_queue")
          .update({ priority: 95 })
          .eq("id", w.queue_id)
          .in("status", ["queued", "approved"]);
        if (!e) prioritised++;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      action,
      scored_n: scored.length,
      fatigue_index: fatigue,
      feed_quality: feedReport,
      prioritised,
      winners,
      losing,
      generated_at: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});