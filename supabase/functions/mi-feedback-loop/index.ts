import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WINDOW_DAYS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

    // Pull all published drafts
    const { data: drafts } = await supabase
      .from("mi_remix_drafts")
      .select("id, recipe_id, published_pin_id, published_video_id")
      .not("recipe_id", "is", null)
      .or("published_pin_id.not.is.null,published_video_id.not.is.null");

    const pinIds = Array.from(new Set((drafts ?? []).map((d) => d.published_pin_id).filter(Boolean))) as string[];
    const videoIds = Array.from(new Set((drafts ?? []).map((d) => d.published_video_id).filter(Boolean))) as string[];

    // Pin metrics
    const pinMetrics: Record<string, { impressions: number; engagements: number; clicks: number }> = {};
    if (pinIds.length) {
      const { data: pm } = await supabase
        .from("gi_pinterest_pin_metrics")
        .select("pin_id, impressions, saves, pin_clicks, outbound_clicks")
        .in("pin_id", pinIds)
        .gte("date", since);
      for (const r of pm ?? []) {
        const k = r.pin_id;
        pinMetrics[k] ??= { impressions: 0, engagements: 0, clicks: 0 };
        pinMetrics[k].impressions += r.impressions ?? 0;
        pinMetrics[k].engagements += (r.saves ?? 0) + (r.pin_clicks ?? 0);
        pinMetrics[k].clicks += r.outbound_clicks ?? 0;
      }
    }

    // Video metrics
    const videoMetrics: Record<string, { impressions: number; engagements: number; clicks: number }> = {};
    if (videoIds.length) {
      const { data: vm } = await supabase
        .from("gi_tiktok_video_metrics")
        .select("video_id, views, likes, comments, shares, profile_clicks")
        .in("video_id", videoIds)
        .gte("date", since);
      for (const r of vm ?? []) {
        const k = r.video_id;
        videoMetrics[k] ??= { impressions: 0, engagements: 0, clicks: 0 };
        videoMetrics[k].impressions += r.views ?? 0;
        videoMetrics[k].engagements += (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0);
        videoMetrics[k].clicks += r.profile_clicks ?? 0;
      }
    }

    // Per-recipe aggregates
    const byRecipe: Record<string, {
      drafts: number; pins: number; videos: number;
      impressions: number; engagements: number; clicks: number;
    }> = {};

    const draftPerf: { id: string; score: number }[] = [];

    for (const d of drafts ?? []) {
      const rid = d.recipe_id as string;
      byRecipe[rid] ??= { drafts: 0, pins: 0, videos: 0, impressions: 0, engagements: 0, clicks: 0 };
      byRecipe[rid].drafts++;
      let imp = 0, eng = 0, clk = 0;
      if (d.published_pin_id && pinMetrics[d.published_pin_id]) {
        const m = pinMetrics[d.published_pin_id];
        imp += m.impressions; eng += m.engagements; clk += m.clicks;
        byRecipe[rid].pins++;
      }
      if (d.published_video_id && videoMetrics[d.published_video_id]) {
        const m = videoMetrics[d.published_video_id];
        imp += m.impressions; eng += m.engagements; clk += m.clicks;
        byRecipe[rid].videos++;
      }
      byRecipe[rid].impressions += imp;
      byRecipe[rid].engagements += eng;
      byRecipe[rid].clicks += clk;

      const ctr = imp > 0 ? clk / imp : 0;
      const er = imp > 0 ? eng / imp : 0;
      const score = Number((ctr * 1000 + er * 500 + Math.log10(1 + eng) * 5).toFixed(3));
      draftPerf.push({ id: d.id, score });
    }

    // Update drafts performance_score
    for (const dp of draftPerf) {
      await supabase.from("mi_remix_drafts")
        .update({ performance_score: dp.score, last_scored_at: new Date().toISOString() })
        .eq("id", dp.id);
    }

    // Per-recipe records + recipe score update
    let recipesUpdated = 0;
    for (const [rid, agg] of Object.entries(byRecipe)) {
      const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0;
      const er = agg.impressions > 0 ? agg.engagements / agg.impressions : 0;
      const composite = Number((ctr * 1000 + er * 500 + Math.log10(1 + agg.engagements) * 10).toFixed(3));

      await supabase.from("mi_recipe_performance").insert({
        recipe_id: rid,
        window_days: WINDOW_DAYS,
        drafts_count: agg.drafts,
        pins_count: agg.pins,
        videos_count: agg.videos,
        total_impressions: agg.impressions,
        total_engagements: agg.engagements,
        total_clicks: agg.clicks,
        avg_ctr: Number(ctr.toFixed(5)),
        avg_engagement_rate: Number(er.toFixed(5)),
        composite_score: composite,
      });

      // Blend new performance into recipe.score (70% existing baseline, 30% performance signal)
      const { data: cur } = await supabase
        .from("mi_creative_recipes")
        .select("score")
        .eq("id", rid)
        .maybeSingle();
      const baseline = Number(cur?.score ?? 0);
      const blended = Number((baseline * 0.7 + composite * 0.3).toFixed(3));
      await supabase.from("mi_creative_recipes")
        .update({ score: blended, active: blended > 0.5 || baseline > 0.5 })
        .eq("id", rid);
      recipesUpdated++;
    }

    return new Response(JSON.stringify({
      ok: true,
      window_days: WINDOW_DAYS,
      drafts_scored: draftPerf.length,
      recipes_updated: recipesUpdated,
      pins_tracked: pinIds.length,
      videos_tracked: videoIds.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});