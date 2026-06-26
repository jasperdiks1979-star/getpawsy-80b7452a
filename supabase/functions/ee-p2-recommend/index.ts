import { corsHeaders, svc, requireAdmin, ok, err } from "../_shared/ee-p2-common.ts";

// Generate observation-only recommendations from recent training samples
// and emotion/experiment data. Recommendations are NEVER auto-applied.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;
  const sb = svc();
  try {
    const recs: any[] = [];
    const families: any[] = [];

    const { data: samples } = await sb
      .from("ee_p2_training_samples")
      .select("features, outcomes, label_score, product_id")
      .order("ingested_at", { ascending: false })
      .limit(2000);

    // Winning headlines / hooks / ctas
    for (const dim of ["headline", "hook", "cta"] as const) {
      const agg: Record<string, { n: number; ctr: number; rev: number; sv: number; sample: string }> = {};
      for (const s of samples ?? []) {
        const f = (s as any).features ?? {};
        const o = (s as any).outcomes ?? {};
        const key = String(f[dim] ?? "").trim().toLowerCase();
        if (!key) continue;
        const pat = key.split(/\s+/).slice(0, 3).join(" ");
        agg[pat] ??= { n: 0, ctr: 0, rev: 0, sv: 0, sample: f[dim] };
        agg[pat].n++;
        agg[pat].ctr += Number(o.ctr ?? 0);
        agg[pat].rev += Number(o.revenue ?? 0);
        agg[pat].sv += Number(o.saves ?? 0);
      }
      const sorted = Object.entries(agg)
        .filter(([, v]) => v.n >= 3)
        .map(([k, v]) => ({ pattern: k, sample: v.sample, n: v.n, avg_ctr: v.ctr / v.n, avg_rev: v.rev / v.n, avg_sv: v.sv / v.n }))
        .sort((a, b) => b.avg_ctr - a.avg_ctr)
        .slice(0, 20);
      for (const r of sorted) {
        families.push({
          family_type: dim,
          pattern: r.pattern,
          pattern_sample: r.sample,
          sample_size: r.n,
          avg_ctr: r.avg_ctr,
          avg_saves: r.avg_sv,
          avg_revenue: r.avg_rev,
          win_rate: Math.min(1, r.avg_ctr * 10),
          confidence: Math.min(1, r.n / 20),
          last_observed: new Date().toISOString(),
        });
      }
      if (sorted[0]) {
        recs.push({
          rec_type: dim,
          target_entity_type: "global",
          target_entity_id: "global",
          recommendation: { pattern: sorted[0].pattern, sample: sorted[0].sample },
          reasoning: `Top ${dim} family by CTR over last ${samples?.length ?? 0} samples`,
          expected_uplift: sorted[0].avg_ctr,
          confidence: Math.min(1, sorted[0].n / 20),
        });
      }
    }

    // Best emotion
    const { data: emo } = await sb.from("ee_p2_emotion_scores").select("dominant_emotion").limit(2000);
    if (emo?.length) {
      const cnt: Record<string, number> = {};
      for (const e of emo) { const k = (e as any).dominant_emotion ?? "neutral"; cnt[k] = (cnt[k] ?? 0) + 1; }
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      if (top) recs.push({
        rec_type: "emotion",
        target_entity_type: "global",
        target_entity_id: "global",
        recommendation: { emotion: top[0] },
        reasoning: `Most common dominant emotion across ${emo.length} scored creatives`,
        confidence: Math.min(1, top[1] / 100),
      });
    }

    // Best board / publishing time / image style from experiments
    const { data: exps } = await sb.from("ee_p2_experiments").select("experiment_type, winner_variant, confidence, uplift").order("created_at", { ascending: false }).limit(50);
    for (const e of exps ?? []) {
      const ee = e as any;
      if (!ee.winner_variant) continue;
      recs.push({
        rec_type: ee.experiment_type === "posting_time" ? "publish_time" : ee.experiment_type === "board" ? "board" : ee.experiment_type === "image_style" ? "image_style" : ee.experiment_type,
        target_entity_type: "global",
        target_entity_id: "global",
        recommendation: { winner: ee.winner_variant, uplift: ee.uplift },
        reasoning: `Experiment winner for ${ee.experiment_type}`,
        expected_uplift: ee.uplift ?? 0,
        confidence: ee.confidence ?? 0,
      });
    }

    if (families.length) await sb.from("ee_p2_winning_families").insert(families);
    if (recs.length) await sb.from("ee_p2_recommendations").insert(recs);
    return ok({ recommendations: recs.length, families: families.length });
  } catch (e) {
    return err(String(e));
  }
});