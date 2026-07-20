// Genesis V4.1 — Feed Quality Engine (Discovery-First).
// Pure read-only analyzer over existing pcie2_creatives + pcie2_pin_performance.
// Computes:
//   - Feed Discovery Score (0-100)
//   - Feed Fatigue Index (0-100, lower = better)
//   - Per-dimension diversity scores
//   - Top repetitive dimensions + suggested corrections
//   - Follow / Save / Session-depth probabilities derived from REAL performance
// No new tables. Audit via pcie_v2_events.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.3";

const DIMENSIONS = [
  "concept","lighting","composition","background","layout","animal_breed",
  "headline","hook","cta","primary_emotion","product_id","camera_angle",
  "visual_style","persona_id",
] as const;

const HUMAN_LABEL: Record<string, string> = {
  concept:"scene/world", lighting:"lighting", composition:"composition",
  background:"interior/room", layout:"human framing", animal_breed:"pet/animal",
  headline:"headline copy", hook:"hook copy", cta:"cta copy",
  primary_emotion:"emotion", product_id:"product", camera_angle:"camera angle",
  visual_style:"visual style", persona_id:"persona",
};

function entropyNorm(values: string[]): number {
  // Shannon entropy normalized to [0,1] against log(N_unique_max).
  const counts = new Map<string, number>();
  let total = 0;
  for (const raw of values) {
    const v = (raw ?? "").toString().toLowerCase().trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
    total++;
  }
  if (total === 0 || counts.size <= 1) return counts.size <= 1 ? 0 : 1;
  let H = 0;
  for (const n of counts.values()) {
    const p = n / total;
    H -= p * Math.log(p);
  }
  return Math.min(1, H / Math.log(counts.size));
}

function dominance(values: string[]): { value: string; share: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const raw of values) {
    const v = (raw ?? "").toString().toLowerCase().trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
    total++;
  }
  let best = ""; let max = 0;
  for (const [k, n] of counts) if (n > max) { max = n; best = k; }
  return { value: best, share: total ? max / total : 0 };
}

function clusterRuns(values: string[]): number {
  // Count consecutive-same runs (cluster penalty).
  let runs = 0;
  for (let i = 1; i < values.length; i++) {
    const a = (values[i-1] ?? "").toString().toLowerCase().trim();
    const b = (values[i] ?? "").toString().toLowerCase().trim();
    if (a && a === b) runs++;
  }
  return values.length ? runs / values.length : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const windowSize = Math.min(500, Math.max(20, Number(body?.window ?? 100)));
    const persist = body?.persist !== false;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: recent, error } = await supabase
      .from("pcie2_creatives")
      .select("id,headline,hook,cta,visual_style,lighting,composition,background,primary_emotion,animal_breed,camera_angle,layout,concept,persona_id,product_id,created_at")
      .order("created_at", { ascending: false })
      .limit(windowSize);
    if (error) throw error;
    const rows = recent ?? [];

    // Per-dimension diversity (entropy) + top dominant value.
    const diversity: Record<string, number> = {};
    const top_repetitive: Array<{ dimension: string; label: string; value: string; share: number }> = [];
    for (const dim of DIMENSIONS) {
      const vals = rows.map((r: any) => String(r[dim] ?? ""));
      diversity[dim] = Number((entropyNorm(vals) * 100).toFixed(1));
      const dom = dominance(vals);
      if (dom.share >= 0.25) {
        top_repetitive.push({
          dimension: dim, label: HUMAN_LABEL[dim] ?? dim,
          value: dom.value, share: Number(dom.share.toFixed(3)),
        });
      }
    }
    top_repetitive.sort((a, b) => b.share - a.share);

    // Cluster penalty: consecutive-same runs on key visual dimensions.
    const clusterAxes = ["background","concept","animal_breed","product_id","primary_emotion"];
    let clusterPenalty = 0;
    for (const k of clusterAxes) {
      clusterPenalty += clusterRuns(rows.map((r: any) => String(r[k] ?? "")));
    }
    clusterPenalty = clusterPenalty / clusterAxes.length; // 0..1

    // Feed Discovery Score = weighted mean of diversity dims minus cluster penalty.
    const weights: Record<string, number> = {
      concept: 1.4, background: 1.4, animal_breed: 1.2, primary_emotion: 1.1,
      lighting: 1.1, composition: 1.0, camera_angle: 1.0, visual_style: 1.0,
      layout: 0.9, headline: 1.2, hook: 1.1, cta: 0.8, product_id: 1.0, persona_id: 0.9,
    };
    let wSum = 0, w = 0;
    for (const dim of DIMENSIONS) {
      const wt = weights[dim] ?? 1;
      wSum += (diversity[dim] ?? 0) * wt;
      w += wt;
    }
    const rawDiscovery = w ? wSum / w : 0;
    const feed_discovery_score = Math.max(0, Math.min(100,
      Number((rawDiscovery - clusterPenalty * 25).toFixed(1))
    ));

    // Feed Fatigue Index = inverse of discovery + dominance pressure.
    const dominancePressure = top_repetitive.length
      ? top_repetitive.slice(0, 5).reduce((a, b) => a + b.share, 0) / 5
      : 0;
    const feed_fatigue_index = Math.max(0, Math.min(100, Number(
      ((100 - feed_discovery_score) * 0.6 + dominancePressure * 100 * 0.4).toFixed(1)
    )));

    // Suggested corrections — actionable nudges.
    const suggestions = top_repetitive.slice(0, 6).map((t) => ({
      dimension: t.dimension,
      action:
        t.share >= 0.5
          ? `Reduce '${t.value}' probability by 80% on ${t.label}`
          : t.share >= 0.35
          ? `Down-weight '${t.value}' on ${t.label} by 50%`
          : `Down-weight '${t.value}' on ${t.label} by 25%`,
      share: t.share,
    }));

    // Real performance proxies from pcie2_pin_performance.
    const ids = rows.map((r: any) => r.id).filter(Boolean);
    let save_rate_avg = 0, ctr_avg = 0, outbound_rate_avg = 0, sample = 0;
    if (ids.length) {
      const { data: perf } = await supabase
        .from("pcie2_pin_performance")
        .select("creative_id,impressions,outbound_clicks,saves,clicks")
        .in("creative_id", ids);
      const byId = new Map<string, { i: number; o: number; s: number; c: number }>();
      for (const p of (perf ?? []) as any[]) {
        const cur = byId.get(p.creative_id) ?? { i: 0, o: 0, s: 0, c: 0 };
        cur.i += Number(p.impressions ?? 0);
        cur.o += Number(p.outbound_clicks ?? 0);
        cur.s += Number(p.saves ?? 0);
        cur.c += Number(p.clicks ?? 0);
        byId.set(p.creative_id, cur);
      }
      let totI = 0, totO = 0, totS = 0, totC = 0;
      for (const v of byId.values()) {
        if (v.i <= 0) continue;
        totI += v.i; totO += v.o; totS += v.s; totC += v.c; sample++;
      }
      if (totI > 0) {
        save_rate_avg = totS / totI;
        ctr_avg = totC / totI;
        outbound_rate_avg = totO / totI;
      }
    }

    // Follow/Save/Session-depth probabilities. Calibrated to plausible Pinterest pet
    // benchmarks (save 0.5% baseline) and modulated by discovery score.
    const discoveryBoost = (feed_discovery_score - 50) / 50; // -1..1
    const baseFollow = 0.002; // 0.2% of viewers
    const follow_probability = Math.max(0, Math.min(0.05,
      baseFollow * (1 + discoveryBoost) + save_rate_avg * 0.1
    ));
    const feed_save_density = Math.max(0, Math.min(1,
      save_rate_avg * (1 + discoveryBoost * 0.5)
    ));
    // Session depth: scaled 1..15 pins; rises with discovery.
    const session_depth_est = Number((4 + discoveryBoost * 6 + ctr_avg * 50).toFixed(2));

    const verdict: "publish" | "regenerate" | "hold" =
      feed_discovery_score >= 70 ? "publish"
      : feed_discovery_score >= 55 ? "regenerate"
      : "hold";

    const result = {
      window: rows.length,
      feed_discovery_score,
      feed_fatigue_index,
      diversity_by_dimension: diversity,
      cluster_penalty: Number(clusterPenalty.toFixed(3)),
      dominance_pressure: Number(dominancePressure.toFixed(3)),
      top_repetitive,
      suggested_corrections: suggestions,
      real_performance: {
        sample_size: sample,
        save_rate_avg: Number(save_rate_avg.toFixed(5)),
        ctr_avg: Number(ctr_avg.toFixed(5)),
        outbound_rate_avg: Number(outbound_rate_avg.toFixed(5)),
      },
      probabilities: {
        follow_probability: Number(follow_probability.toFixed(5)),
        feed_save_density: Number(feed_save_density.toFixed(5)),
        session_depth_est,
      },
      verdict,
      generated_at: new Date().toISOString(),
    };

    if (persist) {
      await supabase.from("pcie_v2_events").insert({
        event_type: "gv41_feed_quality",
        payload: result,
      } as never).then(() => {}, () => {});
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});