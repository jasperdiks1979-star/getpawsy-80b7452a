import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const today = new Date().toISOString().slice(0, 10);

    const { data: cfg } = await sb
      .from("growth_autopilot_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (cfg?.emergency_stop) {
      return new Response(
        JSON.stringify({ ok: false, traceId, message: "Emergency stop is active" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const maxPicks = Math.min(5, Math.max(1, Number(cfg?.max_pins_per_day ?? 4)));
    const minScore = Number(cfg?.min_product_score ?? 55);
    const whitelist: string[] = cfg?.category_whitelist ?? [];

    // Today's scores
    const { data: scores, error: sErr } = await sb
      .from("growth_product_scores")
      .select("product_id, opportunity_score, reasons, recommended_channel, recommended_angle, recommended_hook, confidence_score, signals")
      .eq("day", today)
      .gte("opportunity_score", minScore)
      .order("opportunity_score", { ascending: false })
      .limit(200);
    if (sErr) throw sErr;

    if (!scores || scores.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, traceId, picked: 0, message: "No scored products meet threshold; run scoring first" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Load product meta (active, stock, category, image)
    const ids = scores.map((s) => s.product_id);
    const { data: products } = await sb
      .from("products")
      .select("id, name, slug, category, image_url, stock, is_active")
      .in("id", ids);
    const pmap = new Map((products ?? []).map((p) => [p.id, p]));

    // Phase 5: feedback bias from learning loop
    const { data: strat } = await sb
      .from("growth_strategy_scores")
      .select("dimension, key, score, samples");
    const stratMap = new Map<string, { score: number; samples: number }>();
    for (const s of strat ?? []) {
      stratMap.set(`${s.dimension}::${String(s.key).toLowerCase()}`, {
        score: Number(s.score ?? 0),
        samples: Number(s.samples ?? 0),
      });
    }
    // Bias range ~ +/- 12 points on opportunity_score
    function biasFor(angle: string | null, category: string | null): { bias: number; meta: Record<string, number> } {
      const meta: Record<string, number> = {};
      let bias = 0;
      const a = stratMap.get(`angle::${(angle ?? "").toLowerCase()}`);
      const c = stratMap.get(`category::${(category ?? "").toLowerCase()}`);
      if (a && a.samples >= 2) {
        // strategy scores live roughly 0..50 (reward*200 capped). Center at 20.
        const norm = Math.max(-1, Math.min(1, (a.score - 20) / 20));
        const w = norm * 8;
        bias += w;
        meta.angle_bias = Number(w.toFixed(2));
      }
      if (c && c.samples >= 2) {
        const norm = Math.max(-1, Math.min(1, (c.score - 20) / 20));
        const w = norm * 4;
        bias += w;
        meta.category_bias = Number(w.toFixed(2));
      }
      return { bias, meta };
    }

    // Exclude products picked in last 7 days
    const since7 = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const { data: recent } = await sb
      .from("growth_decisions")
      .select("product_id")
      .eq("decision_type", "daily_pick")
      .gte("day", since7);
    const excluded = new Set((recent ?? []).map((r) => r.product_id).filter(Boolean));

    const eligible: Array<typeof scores[number] & { adjusted: number; bias: number; bias_meta: Record<string, number> }> = [];
    for (const s of scores) {
      const p = pmap.get(s.product_id);
      if (!p) continue;
      if (!p.is_active) continue;
      if (!p.image_url) continue;
      if (excluded.has(s.product_id)) continue;
      if (whitelist.length > 0 && !whitelist.some((w) => (p.category ?? "").toLowerCase().includes(w.toLowerCase()))) continue;
      const { bias, meta } = biasFor(s.recommended_angle as string | null, p.category);
      const adjusted = Number(s.opportunity_score) + bias;
      eligible.push({ ...s, adjusted, bias, bias_meta: meta });
    }
    // Re-rank by learning-adjusted score
    eligible.sort((a, b) => b.adjusted - a.adjusted);

    // Mix: 60% safe winners (top), 40% experiments (mid-tier)
    const safeCount = Math.ceil(maxPicks * 0.6);
    const expCount = maxPicks - safeCount;
    const safe = eligible.slice(0, safeCount);
    const midPool = eligible.slice(safeCount, safeCount + 50);
    // randomize experiments
    const experiments: typeof safe = [];
    const pool = [...midPool];
    while (experiments.length < expCount && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      experiments.push(pool.splice(idx, 1)[0]);
    }

    const picks = [...safe, ...experiments];

    const inserts = picks.map((s) => {
      const p = pmap.get(s.product_id)!;
      return {
        day: today,
        decision_type: "daily_pick",
        product_id: s.product_id,
        payload: {
          product_name: p.name,
          product_slug: p.slug,
          category: p.category,
          opportunity_score: s.opportunity_score,
          adjusted_score: Number(s.adjusted.toFixed(2)),
          learning_bias: Number(s.bias.toFixed(2)),
          bias_meta: s.bias_meta,
          confidence_score: s.confidence_score,
          recommended_channel: s.recommended_channel,
          recommended_angle: s.recommended_angle,
          recommended_hook: s.recommended_hook,
          bucket: safe.includes(s) ? "safe_winner" : "experiment",
        },
        reason: `Score ${Math.round(Number(s.opportunity_score))}${s.bias ? ` (${s.bias >= 0 ? "+" : ""}${s.bias.toFixed(1)} learn)` : ""} · ${s.recommended_angle} · ${safe.includes(s) ? "safe winner" : "experiment"}`,
        status: cfg?.mode === "auto" ? "approved" : "pending",
      };
    });

    if (inserts.length > 0) {
      const { error: iErr } = await sb.from("growth_decisions").insert(inserts);
      if (iErr) throw iErr;
    }

    await sb.from("growth_events").insert({
      event_type: "daily_selection",
      trace_id: traceId,
      payload: { day: today, picked: inserts.length, mode: cfg?.mode ?? "manual", strategies_applied: stratMap.size },
    });

    return new Response(
      JSON.stringify({ ok: true, traceId, picked: inserts.length, message: `Selected ${inserts.length} products for ${today}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ ok: false, traceId, message: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});