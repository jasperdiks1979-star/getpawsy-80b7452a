// Pinterest Video — Top Performer Cloner
// Scans pinterest_video_metrics, finds pins with CTR above threshold, and
// generates N=3 new queue drafts per winning asset using the same hook
// structure. Tracks composite copy_variant winners so future runs prefer
// them. Idempotent via pinterest_video_copy_history (30-day no-repeat).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { generateNVariations, buildDestinationUrl, type ProductContext } from "../_shared/pinterest-video-meta.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CTR_THRESHOLD = 0.012;     // 1.2% outbound CTR — top decile for Pinterest video
const MIN_IMPRESSIONS = 500;     // statistical floor
const CLONES_PER_WINNER = 3;
const LOOKBACK_DAYS = 14;

async function loadProduct(sb: any, slug: string | null): Promise<ProductContext | undefined> {
  if (!slug) return undefined;
  const { data } = await sb.from("products")
    .select("slug, name, category, benefit_angle, primary_keyword, seo_keywords")
    .eq("slug", slug).maybeSingle();
  if (!data) return { slug };
  return {
    slug: data.slug, name: data.name, category: data.category,
    benefit_angle: data.benefit_angle, primary_keyword: data.primary_keyword,
    tags: Array.isArray(data.seo_keywords) ? data.seo_keywords : null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const trace_id = crypto.randomUUID();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
    // Aggregate metrics per asset.
    const { data: metrics } = await sb.from("pinterest_video_metrics")
      .select("asset_id, pin_id, impressions, outbound_clicks, saves, ctr, day")
      .gte("day", since);
    const byAsset = new Map<string, { impressions: number; clicks: number; saves: number; pin_ids: Set<string> }>();
    for (const m of metrics || []) {
      if (!m.asset_id) continue;
      const agg = byAsset.get(m.asset_id) || { impressions: 0, clicks: 0, saves: 0, pin_ids: new Set<string>() };
      agg.impressions += Number(m.impressions || 0);
      agg.clicks += Number(m.outbound_clicks || 0);
      agg.saves += Number(m.saves || 0);
      if (m.pin_id) agg.pin_ids.add(m.pin_id);
      byAsset.set(m.asset_id, agg);
    }

    const winners: Array<{ asset_id: string; ctr: number; impressions: number; quality: number }> = [];
    for (const [asset_id, agg] of byAsset) {
      if (agg.impressions < MIN_IMPRESSIONS) continue;
      const ctr = agg.clicks / agg.impressions;
      if (ctr < CTR_THRESHOLD) continue;
      const saveRate = agg.saves / agg.impressions;
      const quality = Math.min(100, Math.round((ctr * 60 + saveRate * 40) * 1000));
      winners.push({ asset_id, ctr, impressions: agg.impressions, quality });
    }

    let cloned = 0;
    const cloneLog: any[] = [];
    for (const w of winners) {
      // Persist pin_quality_score on the most recent metric row for this asset.
      await sb.from("pinterest_video_metrics")
        .update({ pin_quality_score: w.quality })
        .eq("asset_id", w.asset_id).gte("day", since);

      const { data: asset } = await sb.from("pinterest_video_assets")
        .select("id, product_slug, hook_type, is_active").eq("id", w.asset_id).maybeSingle();
      if (!asset || !asset.is_active) continue;

      const product = await loadProduct(sb, asset.product_slug);
      const variants = generateNVariations({
        asset_id: asset.id, hook: (asset.hook_type as any) || "unknown",
        count: CLONES_PER_WINNER, product,
      });

      for (const v of variants) {
        // 30-day dedupe
        const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { data: dup } = await sb.from("pinterest_video_copy_history")
          .select("id").eq("variation_hash", v.variation_hash).gte("used_at", since30).limit(1).maybeSingle();
        if (dup) continue;

        const { data, error } = await sb.from("pinterest_video_queue").insert({
          asset_id: asset.id,
          status: "draft",
          title: v.title,
          description: v.description,
          hashtags: v.hashtags,
          cta_text: v.cta_text,
          destination_url: buildDestinationUrl(asset.product_slug),
          variation_hash: v.variation_hash,
          hook_variant: v.hook_variant,
          copy_variant: v.copy_variant,
          cta_variant: v.cta_variant,
        }).select("id").maybeSingle();

        if (!error && data) {
          await sb.from("pinterest_video_copy_history").insert({
            asset_id: asset.id, variation_hash: v.variation_hash,
            title: v.title, description: v.description,
            hook_variant: v.hook_variant, copy_variant: v.copy_variant, cta_variant: v.cta_variant,
            cloned_from_asset_id: asset.id, clone_reason: `ctr=${w.ctr.toFixed(4)} q=${w.quality}`,
          });
          cloned += 1;
          cloneLog.push({ asset_id: asset.id, queue_id: data.id, copy_variant: v.copy_variant });
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true, traceId: trace_id,
      winners: winners.length, cloned, threshold: CTR_THRESHOLD, lookback_days: LOOKBACK_DAYS,
      details: cloneLog,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false, traceId: trace_id, code: "UNEXPECTED_ERROR", message: (e as Error).message,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});