// Pinterest Video Autopilot V5 — autonomous loop.
// Every tick: enforces daily cap (30) + 90-min gap, picks the next ready draft,
// runs Product Match QA + Anti-Slideshow gate, then publishes via
// pinterest-video-publisher. Failed items get an automatic retry; if max
// retries exceeded, they are marked publish_blocked with a reason.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { runProductMatchQa, runAntiSlideshow, inferSpecies, type ProductRef } from "../_shared/product-match-qa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ok = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1) Autopilot flag check
    const { data: settings } = await sb.from("pinterest_video_autopilot_settings").select("*").limit(1).maybeSingle();
    if (!settings?.enabled) return ok({ ok: true, skipped: "autopilot_disabled", traceId });

    const DAILY_CAP = Number(settings.max_per_day ?? 30);
    const GAP_MIN = Number(settings.min_publish_gap_minutes ?? 90);

    // 2) Daily cap
    const dayStart = new Date(); dayStart.setUTCHours(0,0,0,0);
    const { count: publishedToday } = await sb
      .from("pinterest_video_queue").select("*", { count: "exact", head: true })
      .eq("status","published").gte("updated_at", dayStart.toISOString());
    if ((publishedToday ?? 0) >= DAILY_CAP) {
      return ok({ ok: true, skipped: "daily_cap_reached", publishedToday, daily_cap: DAILY_CAP, traceId });
    }

    // 3) Gap check
    const { data: last } = await sb
      .from("pinterest_video_queue").select("updated_at")
      .eq("status","published").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.updated_at) {
      const minsAgo = (Date.now() - new Date(last.updated_at).getTime()) / 60000;
      if (minsAgo < GAP_MIN) return ok({ ok: true, skipped: "gap_not_met", minsAgo, gap_min: GAP_MIN, traceId });
    }

    // 4) Self-heal: requeue stuck "publishing" rows older than 10 min
    const stuckCutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    await sb.from("pinterest_video_queue")
      .update({ status: "draft", error_message: "auto_recovered_from_stuck_publishing" })
      .eq("status","publishing").lt("updated_at", stuckCutoff);

    // 5) Self-heal: re-arm failed/publish_blocked under retry cap with cooldown
    const retryCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
    await sb.rpc("noop").then(() => {}, () => {});
    const { data: retriable } = await sb
      .from("pinterest_video_queue")
      .select("id, attempt_count, max_retries, last_retry_at")
      .in("status", ["publish_blocked","failed","creative_rejected"])
      .lt("attempt_count", 999)
      .limit(20);
    for (const r of (retriable || [])) {
      const under = (r.attempt_count ?? 0) < (r.max_retries ?? 3);
      const cool = !r.last_retry_at || r.last_retry_at < retryCutoff;
      if (under && cool) {
        await sb.from("pinterest_video_queue")
          .update({ status: "draft", last_retry_at: new Date().toISOString() })
          .eq("id", r.id);
      }
    }

    // 6) Pick the next draft
    const { data: draft } = await sb
      .from("pinterest_video_queue")
      .select("*, asset:pinterest_video_assets(*)")
      .eq("status","draft").eq("archived", false)
      .order("priority", { ascending: false }).order("created_at", { ascending: true })
      .limit(1).maybeSingle();
    if (!draft) return ok({ ok: true, skipped: "no_draft", traceId });

    // 7) Resolve product
    const asset = (draft as any).asset || {};
    const slug = asset.product_slug || null;
    let product: ProductRef = { slug };
    if (slug) {
      const { data: prod } = await sb.from("products")
        .select("id, slug, name, category, primary_keyword, seo_keywords").eq("slug", slug).maybeSingle();
      if (prod) product = prod as any;
    }
    const species = inferSpecies(product);

    // 8) Product Match QA
    const qa = runProductMatchQa({
      product,
      script: asset.script_text || null,
      voiceover_text: asset.voiceover_text || null,
      captions: asset.captions || (draft.title ? [draft.title] : []),
      scene_slugs: asset.scene_slugs || [],
      scene_species: (asset.scene_species || []) as ("cat"|"dog"|"other")[],
    });
    const slideshow = runAntiSlideshow({
      scene_count: draft.scene_count,
      unique_image_count: draft.unique_image_count,
      camera_motion_score: asset.camera_motion_score,
      scene_change_count: asset.scene_change_count,
      engine_version: draft.engine_version,
    });

    await sb.from("cinematic_product_match_qa_log").insert({
      asset_id: asset.id || null, product_id: product.id || null, product_slug: product.slug || null,
      reject_score: qa.reject_score + (slideshow.passed ? 0 : slideshow.reasons.length),
      reasons: [...qa.reasons, ...slideshow.reasons],
      script_match_score: qa.scores.script, voiceover_match_score: qa.scores.voiceover,
      scene_match_score: qa.scores.scene, caption_match_score: qa.scores.caption,
      passed: qa.passed && slideshow.passed,
    });

    if (!qa.passed || !slideshow.passed) {
      const allReasons = [...qa.reasons, ...slideshow.reasons].join(",");
      await sb.from("pinterest_video_queue").update({
        status: "publish_blocked",
        error_message: `qa_reject:${allReasons}`,
        attempt_count: (draft.attempt_count ?? 0) + 1,
        last_retry_at: new Date().toISOString(),
      }).eq("id", draft.id);
      return ok({ ok: true, skipped: "qa_rejected", reasons: allReasons, species, traceId });
    }

    // 9) Publish via existing publisher
    const pubRes = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-video-publisher`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ action: "publish", queue_id: draft.id, trace_id: traceId }),
    });
    const pubJson = await pubRes.json().catch(() => ({}));

    return ok({ ok: true, published: !!pubJson?.ok, queue_id: draft.id, species, publisher: pubJson, traceId });
  } catch (e) {
    console.error("[autopilot-tick] error", e);
    return ok({ ok: false, error: String((e as any)?.message ?? e), traceId });
  }
});