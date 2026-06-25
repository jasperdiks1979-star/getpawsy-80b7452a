import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
function ymd(d: Date) { return d.toISOString().slice(0, 10); }
function clamp(n: number) { return Math.max(0, Math.min(100, n)); }
function pct(n: number) { return clamp(n * 100); }

function tierFromScore(s: number) {
  if (s >= 85) return "S";
  if (s >= 70) return "A";
  if (s >= 50) return "B";
  if (s >= 30) return "C";
  return "D";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = admin();
  let body: any = {}; try { body = await req.json(); } catch {}
  const dry = body?.dry_run ?? false;
  const day = body?.day ?? ymd(new Date(Date.now() - 86_400_000));

  const { data: run } = await sb.from("agp_runs").insert({
    engine: "growth_scorer", trigger: body?.trigger ?? "manual", dry_run: dry, status: "running",
  }).select("id").single();
  const runId = run!.id;

  try {
    const { data: today } = await sb.from("agp_signals_daily").select("*").eq("day", day).maybeSingle();
    if (!today) throw new Error(`no signals for ${day}; run agp-signal-collector first`);

    // Subscore formulas — bounded heuristics on observed ranges
    const pinterest = pct(Math.min(1, (today.pin_impressions ?? 0) / 50_000) * 0.4
      + Math.min(1, (today.pin_ctr ?? 0) / 0.02) * 0.4
      + Math.min(1, (today.pins_published ?? 0) / 30) * 0.2);
    const seo = pct(Math.min(1, (today.gsc_clicks ?? 0) / 500) * 0.5
      + Math.min(1, (today.gsc_ctr ?? 0) / 0.05) * 0.3
      + Math.max(0, 1 - ((today.gsc_avg_position ?? 50) / 50)) * 0.2);
    const traffic = pct(Math.min(1, (today.ga_sessions ?? 0) / 2000));
    const revenue = pct(Math.min(1, (today.ga_revenue_cents ?? 0) / 200_000));
    const conversion = pct(today.ga_sessions > 0
      ? Math.min(1, ((today.ga_purchases ?? 0) / today.ga_sessions) / 0.03) : 0);
    const catalog_health = pct(today.cj_in_stock_pct ?? 0);
    const media = pct(today.catalog_media_coverage_pct ?? 0);
    const product_quality = pct(today.catalog_creative_ready_pct ?? 0);
    const creative = pct(today.cpe_qa_pass_pct ?? 0);
    const performance = pct(today.cv3_success_pct ?? 0);
    const automation = pct(Math.min(1, ((today.cpe_jobs_run ?? 0) + (today.cv3_renders ?? 0)) / 50));
    const ai_efficiency = pct(today.cpe_spend_usd > 0
      ? Math.min(1, (today.cpe_jobs_run ?? 0) / Math.max(1, today.cpe_spend_usd * 20)) : 0.5);

    // Trend direction vs 7d ago
    const { data: weekAgo } = await sb.from("agp_signals_daily").select("ga_sessions,pin_impressions")
      .lte("day", ymd(new Date(new Date(day).getTime() - 7 * 86_400_000))).order("day", { ascending: false }).limit(1).maybeSingle();
    const trafficTrend = (weekAgo as any)?.ga_sessions > 0
      ? ((today.ga_sessions - (weekAgo as any).ga_sessions) / (weekAgo as any).ga_sessions) : 0;
    const trend_direction = clamp(50 + trafficTrend * 100);

    const overall = clamp(
      pinterest * 0.15 + seo * 0.12 + traffic * 0.10 + revenue * 0.15 + conversion * 0.10
      + catalog_health * 0.08 + media * 0.06 + product_quality * 0.06 + creative * 0.06
      + performance * 0.04 + automation * 0.04 + ai_efficiency * 0.02 + trend_direction * 0.02
    );

    // Deltas vs prior windows
    async function priorOverall(daysBack: number): Promise<number | null> {
      const target = ymd(new Date(new Date(day).getTime() - daysBack * 86_400_000));
      const { data } = await sb.from("agp_growth_scores").select("overall").eq("day", target).maybeSingle();
      return (data as any)?.overall ?? null;
    }
    const [d1, d7, d30, d90] = await Promise.all([priorOverall(1), priorOverall(7), priorOverall(30), priorOverall(90)]);

    const scoreRow = {
      day, overall,
      seo, pinterest, media, creative, conversion, performance,
      product_quality, catalog_health, traffic, revenue,
      automation, ai_efficiency, trend_direction,
      delta_1d: d1 != null ? overall - d1 : 0,
      delta_7d: d7 != null ? overall - d7 : 0,
      delta_30d: d30 != null ? overall - d30 : 0,
      delta_90d: d90 != null ? overall - d90 : 0,
      details: { traffic_trend_pct: trafficTrend },
    };

    if (!dry) {
      await sb.from("agp_growth_scores").upsert(scoreRow, { onConflict: "day" });
    }

    // Per-product health snapshot (top 600 active by revenue_priority_score if column exists, else first 600)
    const { data: products } = await sb.from("products")
      .select("id,is_active,image_url,seo_title,description,effective_stock,us_stock,price")
      .eq("is_active", true).limit(800);
    const productIds = (products ?? []).map(p => p.id);

    // Pull media + cinematic availability in bulk
    const [{ data: mediaRows }, { data: cv3Rows }, { data: enhRows }] = await Promise.all([
      sb.from("product_media").select("product_id,media_type").in("product_id", productIds),
      sb.from("cinematic_v3_jobs").select("product_id,status").in("product_id", productIds).in("status", ["succeeded","done","completed"]),
      sb.from("cpe_enhanced_images").select("product_id").in("product_id", productIds),
    ]);
    const mediaByProduct: Record<string, { videos: number; images: number }> = {};
    for (const m of mediaRows ?? []) {
      const k = (m as any).product_id;
      if (!mediaByProduct[k]) mediaByProduct[k] = { videos: 0, images: 0 };
      if ((m as any).media_type === "video") mediaByProduct[k].videos++; else mediaByProduct[k].images++;
    }
    const hasVideo = new Set((cv3Rows ?? []).map((r: any) => r.product_id));
    const enhanced = new Set((enhRows ?? []).map((r: any) => r.product_id));

    const healthRows = (products ?? []).map((p: any) => {
      const m = mediaByProduct[p.id] ?? { videos: 0, images: 0 };
      const media_quality = pct((p.image_url ? 0.4 : 0) + Math.min(0.4, m.images * 0.1) + (enhanced.has(p.id) ? 0.2 : 0));
      const pinterest_ready = pct((p.image_url ? 0.5 : 0) + (p.seo_title ? 0.3 : 0) + (Number(p.price) > 0 ? 0.2 : 0));
      const seo_ready = pct((p.seo_title ? 0.5 : 0) + ((p.description?.length ?? 0) >= 200 ? 0.5 : 0));
      const creative_quality = pct(enhanced.has(p.id) ? 0.8 : (m.images > 0 ? 0.4 : 0.1));
      const video_avail = hasVideo.has(p.id) || m.videos > 0;
      const lifestyle_avail = m.images >= 2;
      const qa_score = pct((p.image_url && p.seo_title && (p.description?.length ?? 0) >= 100) ? 1 : 0.4);
      const stockOk = (p.effective_stock ?? 0) > 0 || (p.us_stock ?? 0) > 0;
      const overall_p = clamp(media_quality * 0.2 + pinterest_ready * 0.2 + seo_ready * 0.2
        + creative_quality * 0.15 + qa_score * 0.15 + (stockOk ? 10 : 0));

      const actions: string[] = [];
      if (!enhanced.has(p.id)) actions.push("enhance_image");
      if (!hasVideo.has(p.id) && m.videos === 0) actions.push("gen_cinematic");
      if (!lifestyle_avail) actions.push("gen_lifestyle");
      if (!p.seo_title) actions.push("rewrite_title");
      if ((p.description?.length ?? 0) < 200) actions.push("rewrite_description");
      if (!stockOk) actions.push("flag_out_of_stock");

      return {
        product_id: p.id,
        computed_at: new Date().toISOString(),
        overall: overall_p,
        media_quality, pinterest_ready, seo_ready, creative_quality,
        video_avail, lifestyle_avail, qa_score,
        ctr: 0, cvr: 0, revenue_30d_cents: 0, traffic_30d: 0,
        priority_tier: tierFromScore(overall_p),
        recommended_actions: actions,
        details: { stock_ok: stockOk, images: m.images, videos: m.videos },
      };
    });

    if (!dry && healthRows.length) {
      // chunked upsert
      for (let i = 0; i < healthRows.length; i += 200) {
        await sb.from("agp_product_health").upsert(healthRows.slice(i, i + 200), { onConflict: "product_id" });
      }
    }

    const tierCounts = healthRows.reduce((a: Record<string, number>, r) => { a[r.priority_tier] = (a[r.priority_tier] ?? 0) + 1; return a; }, {});

    await sb.from("agp_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(),
      counts: { day, overall, products_scored: healthRows.length, tiers: tierCounts },
    }).eq("id", runId);

    return new Response(JSON.stringify({ ok: true, run_id: runId, day, score: scoreRow, tier_counts: tierCounts, products_scored: healthRows.length, dry_run: dry }),
      { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    await sb.from("agp_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: String(e) }).eq("id", runId);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...cors, "content-type": "application/json" } });
  }
});